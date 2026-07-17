import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import {
  getOrderByIdForUser,
  getBundleOrders,
  markOrderProcessing,
  markBundleOrdersProcessing,
  markOrderPaid,
  markBundlePaid,
  markOrderFailed,
  markBundleFailed,
  markOrderCancelled,
  isOrderExpired,
} from '@/lib/services/order'
import { tapPayCharge, tapPayChargeByToken, tapPayChargeLinePay } from '@/lib/services/tappay'
import { buildLiffOrderUrl } from '@/lib/utils/liff-url'
import { getTenantById } from '@/lib/services/tenant'
import { triggerEsimActivation } from '@/lib/services/esim'
import { calculateAndSaveCommission } from '@/lib/services/commission'
import { issueRepurchaseCouponForOrder } from '@/lib/services/coupon'
import { getUserById } from '@/lib/services/user'
import { notifyOrderPaid } from '@/lib/services/notification'
import { upsertSavedCard } from '@/lib/services/saved-card'
import { fireAndLog } from '@/lib/utils/fire-and-log'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { prisma } from '@/lib/db/prisma'
import { decrypt, safeDecrypt } from '@/lib/utils/crypto'
import { OrderStatus } from '@prisma/client'

// POST /api/payment/tappay
// Body: { orderId?, bundleId?, prime?, useToken?, remember?, returnUrl?, method? }
//   - Single order: pass orderId
//   - Multi-item bundle: pass bundleId (charges sum of all bundle orders once)
//   - method='LINE_PAY' + prime: LINE Pay 導轉付款（一律回傳 paymentUrl）
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // 限流：同一使用者短時間內過多扣款請求 → 擋（防重複送出/濫用）。fail-open。
  if (!(await checkRateLimit(`pay:${session.userId}`, 15, 60))) {
    return NextResponse.json({ error: '操作過於頻繁，請稍後再試' }, { status: 429 })
  }

  const body = await req.json()
  const { orderId, bundleId, prime, useToken, remember, returnUrl, method } = body as {
    orderId?: string
    bundleId?: string
    prime?: string
    useToken?: boolean
    remember?: boolean
    returnUrl?: string
    method?: 'CREDIT_CARD' | 'LINE_PAY'
  }

  const isLinePay = method === 'LINE_PAY'

  if (!orderId && !bundleId) {
    return NextResponse.json({ error: 'orderId 或 bundleId 必填' }, { status: 400 })
  }
  if (orderId && bundleId) {
    return NextResponse.json({ error: 'orderId 與 bundleId 不能同時傳入' }, { status: 400 })
  }
  if (isLinePay) {
    if (!prime) return NextResponse.json({ error: 'LINE Pay 需要 prime' }, { status: 400 })
  } else if (!prime && !useToken) {
    return NextResponse.json({ error: 'prime 或 useToken 擇一必填' }, { status: 400 })
  }

  // ─── Resolve orders + amount ────────────────────────────────────────
  // Anchor order is what carries `tapPayOrderId` (unique constraint).
  type Anchor = {
    id: string
    orderNumber: string | null
    createdAt: Date
    status: OrderStatus
    totalPaid: number
    productName: string
  }
  let anchor: Anchor
  let amount: number
  let isBundle = false
  let bundleOrderIds: string[] = []
  let paidItems: { productName: string; qty: number }[] = []   // 付款成功通知用：列出實際方案

  if (bundleId) {
    const orders = await getBundleOrders(bundleId, session.userId)
    if (orders.length === 0) return NextResponse.json({ error: '訂單組不存在' }, { status: 404 })
    if (orders.some(o => o.status !== OrderStatus.PENDING)) {
      return NextResponse.json({ error: '訂單組已不在待付款狀態' }, { status: 409 })
    }
    if (orders.some(o => isOrderExpired(o.createdAt))) {
      await Promise.all(orders.map(o => markOrderCancelled(o.id)))
      return NextResponse.json({ error: '訂單已逾時取消（超過 30 分鐘），請重新下單' }, { status: 410 })
    }
    const first = orders[0]
    anchor = {
      id: first.id,
      orderNumber: first.orderNumber,
      createdAt: first.createdAt,
      status: first.status,
      totalPaid: first.totalPaid,
      productName: first.orderItems[0]?.productName ?? 'eSIM',
    }
    amount = orders.reduce((s, o) => s + o.totalPaid, 0)
    isBundle = true
    bundleOrderIds = orders.map(o => o.id)
    paidItems = orders.flatMap(o => o.orderItems.map(it => ({ productName: it.productName, qty: it.qty })))
  } else {
    const order = await getOrderByIdForUser(orderId!, session.userId)
    if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
    if (order.status !== OrderStatus.PENDING) {
      return NextResponse.json({ error: '訂單已不在待付款狀態' }, { status: 409 })
    }
    if (isOrderExpired(order.createdAt)) {
      await markOrderCancelled(order.id)
      return NextResponse.json({ error: '訂單已逾時取消（超過 30 分鐘），請重新下單' }, { status: 410 })
    }
    anchor = {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      totalPaid: order.totalPaid,
      productName: order.orderItems[0]?.productName ?? 'eSIM',
    }
    amount = order.totalPaid
    paidItems = order.orderItems.map(it => ({ productName: it.productName, qty: it.qty }))
  }

  const user = await getUserById(session.userId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tapPayOrderId = anchor.orderNumber ?? `ESM-${anchor.id.slice(-8).toUpperCase()}`

  // ─── Lock state before charging ─────────────────────────────────────
  // 條件式 PENDING→PROCESSING：搶不到鎖代表已有並發請求在處理（或已非待付款），
  // 直接 409 中止，避免同一張訂單被刷兩次。
  const locked = isBundle
    ? await markBundleOrdersProcessing(bundleId!, anchor.id, tapPayOrderId)
    : await markOrderProcessing(anchor.id, tapPayOrderId)
  if (!locked) {
    return NextResponse.json({ error: '訂單已在處理中或已不在待付款狀態，請勿重複付款' }, { status: 409 })
  }

  const cardholder = {
    phone_number: user.phone ? safeDecrypt(user.phone) : '',
    name: user.displayName ?? '',
    email: user.email ? safeDecrypt(user.email) : '',
  }

  const origin = req.nextUrl.origin
  // returnUrl 由前端拼好（含 /liff/<slug>）一律優先用；前端漏送時退回 server
  // 端依該訂單 owner 的 tenantSlug 重新組路徑，避免落到已刪除的 (liff) 群組
  // 舊 URL 變成 404。
  let frontendRedirectUrl = returnUrl
  if (!frontendRedirectUrl) {
    const tenant = user.tenantAdminId ? await getTenantById(user.tenantAdminId) : null
    frontendRedirectUrl = buildLiffOrderUrl({
      origin,
      tenantSlug: tenant?.slug ?? null,
      orderIdOrBundleId: isBundle ? bundleId! : anchor.id,
      isBundle,
    })
  }
  const backendNotifyUrl = `${origin}/api/payment/tappay/notify`
  const resultUrl = { frontendRedirectUrl, backendNotifyUrl }

  const detailsLabel = isBundle
    ? `eSIM 組合 (${bundleOrderIds.length} 張)`
    : anchor.productName

  let charge
  if (isLinePay) {
    charge = await tapPayChargeLinePay(
      {
        prime: prime!,
        orderId: tapPayOrderId,
        amount,
        details: detailsLabel,
        cardholder,
        resultUrl,
      },
      user.tenantAdminId,
    )
  } else if (useToken) {
    const saved = await prisma.savedCard.findUnique({ where: { userId: session.userId } })
    if (!saved) {
      if (isBundle) await markBundleFailed(bundleId!)
      else await markOrderFailed(anchor.id)
      return NextResponse.json({ error: '未找到儲存卡片，請重新輸入卡號' }, { status: 400 })
    }
    charge = await tapPayChargeByToken(
      {
        cardKey: decrypt(saved.cardKeyEnc),
        cardToken: decrypt(saved.cardTokenEnc),
        orderId: tapPayOrderId,
        amount,
        details: detailsLabel,
        cardholder,
        resultUrl,
      },
      user.tenantAdminId,
    )
  } else {
    charge = await tapPayCharge(
      {
        prime: prime!,
        orderId: tapPayOrderId,
        amount,
        details: detailsLabel,
        cardholder,
        remember: remember ?? false,
        resultUrl,
      },
      user.tenantAdminId,
    )
  }

  if (!charge.ok) {
    if (isBundle) await markBundleFailed(bundleId!)
    else await markOrderFailed(anchor.id)
    return NextResponse.json({ error: charge.message }, { status: 402 })
  }

  // 記憶卡號：勾選 remember 的「新卡」付款，TapPay 在第一段回應就回了 card_secret，
  // 在此立即加密存起來，供下次 pay-by-token 代扣（backend_notify 不帶 card_secret，
  // 所以一定要在這裡存）。存卡失敗不可擋付款流程。
  if (!isLinePay && !useToken && remember && charge.cardSecret) {
    try {
      await upsertSavedCard(session.userId, {
        cardKey: charge.cardSecret.cardKey,
        cardToken: charge.cardSecret.cardToken,
        lastFour: charge.cardInfo?.lastFour,
        cardType: charge.cardInfo?.type,
        funding: charge.cardInfo?.funding,
        cardExpiresAt: charge.cardInfo?.expiryDate,
      })
    } catch (e) {
      console.error('[pay] upsertSavedCard failed', e)
    }
  }

  // 導轉型付款（信用卡 3DS / LINE Pay）— 付款結果由 webhook 非同步通知
  if (charge.paymentUrl) {
    return NextResponse.json({
      requiresRedirect: true,
      paymentUrl: charge.paymentUrl,
      orderId: anchor.id,
      bundleId: isBundle ? bundleId : undefined,
    })
  }

  // ─── Sync success: mark paid and fan out downstream ─────────────────
  if (isBundle) {
    const orders = await markBundlePaid(bundleId!, charge.recTradeId)
    for (const o of orders) {
      fireAndLog('triggerEsimActivation', o.id, triggerEsimActivation(o.id))
      // 分潤/回購券要 await：fire-and-forget 在回應後會被 Vercel 中斷而漏跑（偶發沒發回購券）。兩者皆冪等。
      try { await calculateAndSaveCommission(o.id) } catch (e) { console.error('[tappay] commission failed', o.id, e) }
      try { await issueRepurchaseCouponForOrder(o.id) } catch (e) { console.error('[tappay] repurchase coupon failed', o.id, e) }
    }
    fireAndLog('notifyOrderPaid', session.userId, notifyOrderPaid(session.userId, paidItems, amount, user.tenantAdminId))
    return NextResponse.json({ ok: true, bundleId, orderIds: orders.map(o => o.id) })
  }

  await markOrderPaid(anchor.id, charge.recTradeId)
  fireAndLog('triggerEsimActivation', anchor.id, triggerEsimActivation(anchor.id))
  // 分潤/回購券要 await：fire-and-forget 在回應後會被 Vercel 中斷而漏跑（偶發沒發回購券）。兩者皆冪等。
  try { await calculateAndSaveCommission(anchor.id) } catch (e) { console.error('[tappay] commission failed', anchor.id, e) }
  try { await issueRepurchaseCouponForOrder(anchor.id) } catch (e) { console.error('[tappay] repurchase coupon failed', anchor.id, e) }
  fireAndLog('notifyOrderPaid', session.userId, notifyOrderPaid(session.userId, paidItems, amount, user.tenantAdminId))

  return NextResponse.json({ ok: true, orderId: anchor.id })
}
