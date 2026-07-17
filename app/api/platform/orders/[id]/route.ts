import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { safeDecrypt } from '@/lib/utils/crypto'
import { retryEsimActivation } from '@/lib/services/esim'
import { cancelCommission } from '@/lib/services/commission'
import { restoreCouponsForRefundedOrders } from '@/lib/services/coupon'
import { tapPayRefund } from '@/lib/services/tappay'
import { orderTenantWhere } from '@/lib/services/order'
import { OrderStatus } from '@prisma/client'

// 退款可生效的狀態（已實際扣款者）
const REFUNDABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.COMPLETED,
  OrderStatus.ESIM_PENDING,
]

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/orders/:id
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  // 租戶隔離：非 SUPER_ADMIN（tenantAdminId 為 null 才是平台級）只能存取自己租戶的訂單，
  // 否則可用訂單 id 直接讀其他租戶客戶的 PII。
  const tenantWhere = orderTenantWhere(auth.tenantAdminId)
  const order = await prisma.order.findFirst({
    where: { id, ...tenantWhere },
    include: {
      user: { select: { displayName: true, lineUid: true, phone: true, email: true } },
      orderItems: true,
      orderCoupons: { include: { coupon: { select: { type: true, discount: true } } } },
      commission: true,
    },
  })

  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  // 同捆 = 共用 bundleId 的多筆訂單，每筆 = 一張 eSIM。一次撈齊整捆（含本筆），
  // 前端並列呈現、逐張查看與操作；單張訂單則回傳只含自己一筆。
  const esims = await prisma.order.findMany({
    where: order.bundleId ? { bundleId: order.bundleId, ...tenantWhere } : { id: order.id },
    include: {
      orderItems: { select: { productName: true, qty: true } },
      orderCoupons: { include: { coupon: { select: { type: true, discount: true } } } },
      commission: { select: { commissionAmount: true, ownerRate: true, status: true } },
    },
    orderBy: [{ bundleSeq: 'asc' }, { createdAt: 'asc' }],
  })

  // 退款預覽：讓退款確認視窗能精準說明「會發生什麼」，並對無法自動追回的情況示警。
  //   restore       — 使用過的券（退款會歸還給會員）
  //   voidUnused    — 發出、尚未使用的回購券（退款會作廢）
  //   usedElsewhere — 發出的回購券已被用於其他訂單（無法自動追回，需人工處理）
  // scope=bundle → 以整捆所有訂單為範圍（整捆退款用）；否則只看本筆（單張退款用）。
  const scope = req.nextUrl.searchParams.get('scope')
  const previewIds = scope === 'bundle' && order.bundleId ? esims.map(e => e.id) : [order.id]
  const now = new Date()
  const [restore, voidUnused, usedElsewhere] = await Promise.all([
    prisma.coupon.count({ where: { usedOrderId: { in: previewIds } } }),
    prisma.coupon.count({
      where: {
        sourceOrderId: { in: previewIds }, type: 'GROUP_REPURCHASE', usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    prisma.coupon.count({
      where: { sourceOrderId: { in: previewIds }, type: 'GROUP_REPURCHASE', usedAt: { not: null } },
    }),
  ])

  // 客戶聯絡資訊在 DB 加密；後台撥款/客服需要看明文，解密後回傳（safeDecrypt 相容舊明文）。
  // 會員與付款（同捆共用同一筆 TapPay 收款）為整捆共用脈絡，單獨回傳一次；esims 為逐張明細。
  return NextResponse.json({
    orderNumber: order.orderNumber,
    bundleId: order.bundleId,
    focusedId: order.id,
    user: {
      displayName: order.user.displayName,
      lineUid: order.user.lineUid,
      phone: order.user.phone ? safeDecrypt(order.user.phone) : null,
      email: order.user.email ? safeDecrypt(order.user.email) : null,
    },
    payment: {
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      tapPayRecTradeId: order.tapPayRecTradeId,
    },
    esims,
    refundPreview: { restore, voidUnused, usedElsewhere },
  })
}

// PATCH /api/platform/orders/:id  — action: retry_esim | refund
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { action } = await req.json()

  // 租戶隔離：非 SUPER_ADMIN 只能操作自己租戶的訂單（補發 / 退款都會動到金流與供應商）。
  const tenantWhere = orderTenantWhere(auth.tenantAdminId)

  if (action === 'retry_esim') {
    const order = await prisma.order.findFirst({ where: { id, ...tenantWhere }, select: { status: true } })
    if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
    // 補發對象：付款成功但尚未發卡（PAID；含下單失敗的訂單，已不再轉 ESIM_PENDING）。
    // ESIM_PENDING 保留以相容歷史訂單。COMPLETED 已發卡、其餘狀態未付款，皆不可補發。
    // retryEsimActivation 內部具冪等守門（wmOrderId 已存在則略過），重複觸發安全。
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.ESIM_PENDING) {
      return NextResponse.json({ error: '只有「付款成功但尚未發卡」的訂單可補發' }, { status: 409 })
    }
    retryEsimActivation(id).catch(() => {})
    return NextResponse.json({ ok: true, message: '已觸發補發流程' })
  }

  // 退款：'refund' = 單張（部分退款，不動優惠券）；'refund_bundle' = 整捆全退（退券＋作廢回購券）
  if (action === 'refund' || action === 'refund_bundle') {
    const isBundleAction = action === 'refund_bundle'

    // 焦點訂單：取 bundleId / 共用的 recTradeId / 租戶（退款打 TapPay 用）
    const focus = await prisma.order.findFirst({
      where: { id, ...tenantWhere },
      select: { id: true, bundleId: true, tapPayRecTradeId: true, user: { select: { tenantAdminId: true } } },
    })
    if (!focus) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

    // 退款對象：整捆 → 同 bundleId 所有筆；單張 → 僅本筆
    const groupOrders = await prisma.order.findMany({
      where: isBundleAction && focus.bundleId
        ? { bundleId: focus.bundleId, ...tenantWhere }
        : { id: focus.id, ...tenantWhere },
      select: {
        id: true, status: true, totalPaid: true,
        gift: { select: { claimedAt: true, toUser: { select: { displayName: true } } } },
      },
    })

    const refundable = groupOrders.filter(o => REFUNDABLE_STATUSES.includes(o.status))
    if (refundable.length === 0) {
      return NextResponse.json({ error: '沒有可退款的 eSIM（可能已退款或未付款）' }, { status: 409 })
    }
    // 任一張已被領取的轉贈 → 擋（避免「轉贈後退款」詐騙）
    const claimed = refundable.find(o => o.gift?.claimedAt)
    if (claimed) {
      const who = claimed.gift?.toUser?.displayName ?? '對方'
      return NextResponse.json(
        { error: `其中一張 eSIM 已被「${who}」領取使用，無法自動退款。如需退款請聯絡客服。` },
        { status: 409 },
      )
    }
    if (!focus.tapPayRecTradeId) {
      return NextResponse.json({ error: '此訂單無 TapPay 交易紀錄，無法自動退款。請手動處理。' }, { status: 400 })
    }

    const amount = refundable.reduce((s, o) => s + o.totalPaid, 0)
    const ids = refundable.map(o => o.id)

    // 1. 先打 TapPay refund（整捆共用同一 recTradeId；單張＝對該交易部分退款）— 失敗即 abort、DB 不動
    const refund = await tapPayRefund(focus.tapPayRecTradeId, amount, focus.user.tenantAdminId ?? null)
    if (!refund.ok) {
      return NextResponse.json({ error: `TapPay 退款失敗：${refund.message ?? '未知錯誤'}` }, { status: 502 })
    }

    // 2. 訂單轉 REFUNDED、逐筆取消分潤、作廢未領取的轉贈
    await prisma.order.updateMany({ where: { id: { in: ids } }, data: { status: OrderStatus.REFUNDED } })
    for (const oid of ids) await cancelCommission(oid)
    await prisma.orderGift.updateMany({
      where: { orderId: { in: ids }, claimedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelReason: 'order_refund' },
    })

    // 3. 優惠券：只有「整捆全退」才退還使用券／作廢回購券；單張部分退款不動券。
    //    判定全退＝退完後整捆已無「仍有效」的訂單（無 bundleId 視為單筆＝全退）。
    let fullyRefunded = true
    if (focus.bundleId) {
      const stillActive = await prisma.order.count({
        where: {
          bundleId: focus.bundleId,
          status: { notIn: [OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.FAILED] },
        },
      })
      fullyRefunded = stillActive === 0
    }
    let couponResult = { restored: 0, voided: 0 }
    if (fullyRefunded) {
      // 退券範圍 = 整捆所有訂單 id（使用券掛錨單、回購券掛各筆，務必全帶）
      const scopeIds = focus.bundleId
        ? (await prisma.order.findMany({ where: { bundleId: focus.bundleId }, select: { id: true } })).map(o => o.id)
        : [focus.id]
      couponResult = await restoreCouponsForRefundedOrders(scopeIds)
    }

    return NextResponse.json({
      ok: true,
      refundedAmount:  amount,
      refundedCount:   ids.length,
      couponsRestored: fullyRefunded,
      restoredCoupons: couponResult.restored,
      voidedCoupons:   couponResult.voided,
    })
  }

  return NextResponse.json({ error: 'action 無效' }, { status: 400 })
}
