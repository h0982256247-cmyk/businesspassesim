import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  markOrderPaid,
  markBundlePaid,
  markOrderFailed,
  markBundleFailed,
  markOrderRefunded,
  markOrderCancelled,
  isOrderExpired,
} from '@/lib/services/order'
import { triggerEsimActivation } from '@/lib/services/esim'
import { calculateAndSaveCommission } from '@/lib/services/commission'
import { issueRepurchaseCouponForOrder } from '@/lib/services/coupon'
import { notifyOrderPaid } from '@/lib/services/notification'
import { recordAlert } from '@/lib/services/alert'
import { fireAndLog } from '@/lib/utils/fire-and-log'
import { tapPayRefund, tapPayQueryTrade } from '@/lib/services/tappay'
import { mapTapPayFailureReason } from '@/lib/services/tappay-failure-reason'
import { OrderStatus } from '@prisma/client'

// POST /api/payment/tappay/notify
// TapPay webhook — fires for 3DS result and regular transactions
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }

  const tapPayOrderId = body.order_number as string | undefined
  // 診斷：webhook 一進來就記，方便在 Vercel logs 確認 TapPay 到底有沒有打回來、
  // 以及卡在哪一關（找不到訂單 / 401 / 付款失敗 / 成功）。
  console.log('[tappay-notify] received', {
    order_number: tapPayOrderId,
    status: body.status,
    rec_trade_id: body.rec_trade_id,
  })

  if (!tapPayOrderId) return NextResponse.json({ message: 'Missing order_number' }, { status: 400 })

  const order = await prisma.order.findFirst({
    where: { tapPayOrderId },
    include: {
      user: true,
      orderItems: { take: 1 },
    },
  })

  if (!order) {
    console.warn('[tappay-notify] order NOT FOUND for order_number', tapPayOrderId)
    return NextResponse.json({ message: 'Order not found' }, { status: 404 })
  }

  // 真偽驗證不再靠 x-api-key header（實測 TapPay 的 backend_notify 不帶該 header，
  // 舊版用它比對 partner_key → 每筆合法通知都被 401 擋掉、訂單永遠卡 PROCESSING）。
  // 改在「確定要標記 PAID」前，用 rec_trade_id 向 TapPay Record API 回查驗真（見下）。
  const tenantAdminId = order.user.tenantAdminId

  // Idempotent: skip already-completed orders
  if (order.status === OrderStatus.PAID || order.status === OrderStatus.COMPLETED) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const status = body.status as number | undefined
  const recTradeId = (body.rec_trade_id as string | undefined) ?? ''

  // Bundle: TapPay only knows the anchor order_number; we fan out below.
  const bundleId = order.bundleId

  // 訂單已取消 或 建立時間超過 30 分鐘：若 TapPay 扣款成功立即退款
  const expired = isOrderExpired(order.createdAt)
  if (order.status === OrderStatus.CANCELLED || (expired && status === 0)) {
    if (status === 0 && recTradeId) {
      // For bundles, refund the full charged total (sum across the bundle).
      const refundAmount = bundleId
        ? (await prisma.order.aggregate({
            where: { bundleId },
            _sum: { totalPaid: true },
          }))._sum.totalPaid ?? order.totalPaid
        : order.totalPaid
      const refund = await tapPayRefund(recTradeId, refundAmount, order.user.tenantAdminId)
      if (refund.ok) {
        if (bundleId) {
          await prisma.order.updateMany({ where: { bundleId }, data: { status: OrderStatus.REFUNDED } })
        } else {
          await markOrderRefunded(order.id)
        }
        return NextResponse.json({ message: 'Order expired; payment refunded' })
      }
    }
    if (order.status !== OrderStatus.CANCELLED) await markOrderCancelled(order.id)
    return NextResponse.json({ message: 'Order expired; no action' })
  }

  if (status !== 0) {
    // 把 TapPay 回傳的 status/msg 翻成中文存進 Order.failureReason，
    // 前端在訂單詳情頁顯示。LINE Pay 924 = 使用者主動取消，會顯示「您已取消付款」。
    const reason = mapTapPayFailureReason({
      status,
      msg: (body.msg as string | undefined) ?? null,
    })
    console.warn('[tappay-notify] payment FAILED', { order_number: tapPayOrderId, status, reason })
    if (bundleId) await markBundleFailed(bundleId, reason)
    else await markOrderFailed(order.id, reason)
    return NextResponse.json({ message: 'Payment failed' })
  }

  // ── 驗真：用 rec_trade_id 向 TapPay Record API 回查，確認交易真的存在且金額相符，
  //    才放行標記 PAID（防偽造 notify 騙開卡）。失敗則不標記、回 400。 ──
  const gateway = order.paymentMethod === 'LINE_PAY' ? 'tappay_linepay' : 'tappay_credit'
  const expectedAmount = bundleId
    ? ((await prisma.order.aggregate({ where: { bundleId }, _sum: { totalPaid: true } }))._sum.totalPaid ?? order.totalPaid)
    : order.totalPaid
  const verify = await tapPayQueryTrade(recTradeId, tenantAdminId, gateway)
  // record_status 0 = 已授權（即使尚未請款 is_captured=false 也算付款成立，TapPay
  // 會在 cap_millis 自動請款）。金額需與訂單相符。
  if (!verify.ok || verify.amount !== expectedAmount || verify.recordStatus !== 0) {
    console.warn('[tappay-notify] Record API 驗真失敗，不標記 PAID', { order_number: tapPayOrderId, expectedAmount, verify })
    await recordAlert('payment_verify_failed', {
      orderId: order.id, tenantAdminId,
      orderNumber: tapPayOrderId, expectedAmount,
      gotAmount: verify.ok ? verify.amount : null,
      recordStatus: verify.ok ? verify.recordStatus : null,
      reason: verify.ok ? null : verify.message, gateway,
    })
    return NextResponse.json({ message: 'Verification failed' }, { status: 400 })
  }

  // Mark paid — fan out across the bundle if applicable.
  let paidOrderIds: string[]
  if (bundleId) {
    const paidOrders = await markBundlePaid(bundleId, recTradeId)
    paidOrderIds = paidOrders.map(o => o.id)
  } else {
    await markOrderPaid(order.id, recTradeId)
    paidOrderIds = [order.id]
  }
  console.log('[tappay-notify] marked PAID ✅', { order_number: tapPayOrderId, paidOrderIds })

  // 記憶卡號：card_secret 只在 pay-by-prime「第一段回應」出現、backend_notify 不帶，
  // 故存卡已移到扣款路由 /api/payment/tappay（拿到 charge 回應時）。此處不再處理。

  for (const oid of paidOrderIds) {
    // 開卡必須在 webhook 回 200「之前」await 完成：Vercel serverless 在回應後會凍結/
    // 終止函式，未 await 的背景工作（fire-and-forget）可能根本沒跑完。X6S4GW 即如此
    // ——付款成功卻完全沒有 placeWmOrder 紀錄。commission/coupon 非時間敏感、維持背景。
    try {
      await triggerEsimActivation(oid)
    } catch (e) {
      console.error('[pay-notify] triggerEsimActivation failed', oid, e)
      await recordAlert('esim_activation_failed', { orderId: oid, tenantAdminId, error: e instanceof Error ? e.message : String(e) })
    }
    // 分潤/回購券改為 await：原本 fire-and-forget 在 Vercel 回 200 後函式被凍結/終止，
    // 背景 promise 常沒跑完 → 偶發「付款成功卻沒發回購券/沒記分潤」（社群主韓國單即如此）。
    // 兩者皆為快速且具冪等的 DB 操作，await 成本極低、失敗會記 alert 而非靜默。
    try { await calculateAndSaveCommission(oid) }
    catch (e) { console.error('[pay-notify] commission failed', oid, e); await recordAlert('commission_failed', { orderId: oid, tenantAdminId, error: e instanceof Error ? e.message : String(e) }) }
    try { await issueRepurchaseCouponForOrder(oid) }
    catch (e) { console.error('[pay-notify] repurchase coupon failed', oid, e); await recordAlert('repurchase_coupon_failed', { orderId: oid, tenantAdminId, error: e instanceof Error ? e.message : String(e) }) }
  }

  if (bundleId && paidOrderIds.length > 1) {
    // 整捆：列出整組所有方案 + 加總金額
    const [totalAggregate, bundleItems] = await Promise.all([
      prisma.order.aggregate({ where: { bundleId }, _sum: { totalPaid: true } }),
      prisma.orderItem.findMany({ where: { order: { bundleId } }, select: { productName: true, qty: true } }),
    ])
    fireAndLog('notify_order_paid_failed', order.id, notifyOrderPaid(
      order.userId,
      bundleItems,
      totalAggregate._sum.totalPaid ?? order.totalPaid,
      tenantAdminId,
    ))
  } else {
    const items = order.orderItems.map(it => ({ productName: it.productName, qty: it.qty }))
    fireAndLog('notify_order_paid_failed', order.id, notifyOrderPaid(order.userId, items, order.totalPaid, tenantAdminId))
  }

  return NextResponse.json({ message: 'ok' })
}
