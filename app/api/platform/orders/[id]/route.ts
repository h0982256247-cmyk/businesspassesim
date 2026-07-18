import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { safeDecrypt } from '@/lib/utils/crypto'
import { retryEsimActivation } from '@/lib/services/esim'
import { tapPayRefund } from '@/lib/services/tappay'
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
  const order = await prisma.order.findFirst({
    where: { id },
    include: {
      user: { select: { displayName: true, lineUid: true, phone: true, email: true } },
      orderItems: true,
    },
  })

  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  // 同捆 = 共用 bundleId 的多筆訂單，每筆 = 一張 eSIM。一次撈齊整捆（含本筆），
  // 前端並列呈現、逐張查看與操作；單張訂單則回傳只含自己一筆。
  const esims = await prisma.order.findMany({
    where: order.bundleId ? { bundleId: order.bundleId } : { id: order.id },
    include: {
      orderItems: { select: { productName: true, qty: true } },
    },
    orderBy: [{ bundleSeq: 'asc' }, { createdAt: 'asc' }],
  })

  // 客戶聯絡資訊在 DB 加密；後台撥款/客服需要看明文，解密後回傳（safeDecrypt 相容舊明文）。
  return NextResponse.json({
    orderNumber: order.orderNumber,
    bundleId: order.bundleId,
    focusedId: order.id,
    priceTier: order.priceTier,
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
  })
}

// PATCH /api/platform/orders/:id  — action: retry_esim | refund | refund_bundle
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { action } = await req.json()

  if (action === 'retry_esim') {
    const order = await prisma.order.findFirst({ where: { id }, select: { status: true } })
    if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
    // 補發對象：付款成功但尚未發卡（PAID；含下單失敗的訂單）。ESIM_PENDING 保留以相容歷史。
    // retryEsimActivation 內部具冪等守門（wmOrderId 已存在則略過），重複觸發安全。
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.ESIM_PENDING) {
      return NextResponse.json({ error: '只有「付款成功但尚未發卡」的訂單可補發' }, { status: 409 })
    }
    retryEsimActivation(id).catch(() => {})
    return NextResponse.json({ ok: true, message: '已觸發補發流程' })
  }

  // 退款：'refund' = 單張（部分退款）；'refund_bundle' = 整捆全退
  if (action === 'refund' || action === 'refund_bundle') {
    const isBundleAction = action === 'refund_bundle'

    // 焦點訂單：取 bundleId / 共用的 recTradeId（退款打 TapPay 用）
    const focus = await prisma.order.findFirst({
      where: { id },
      select: { id: true, bundleId: true, tapPayRecTradeId: true },
    })
    if (!focus) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

    // 退款對象：整捆 → 同 bundleId 所有筆；單張 → 僅本筆
    const groupOrders = await prisma.order.findMany({
      where: isBundleAction && focus.bundleId ? { bundleId: focus.bundleId } : { id: focus.id },
      select: { id: true, status: true, totalPaid: true },
    })

    const refundable = groupOrders.filter(o => REFUNDABLE_STATUSES.includes(o.status))
    if (refundable.length === 0) {
      return NextResponse.json({ error: '沒有可退款的 eSIM（可能已退款或未付款）' }, { status: 409 })
    }
    if (!focus.tapPayRecTradeId) {
      return NextResponse.json({ error: '此訂單無 TapPay 交易紀錄，無法自動退款。請手動處理。' }, { status: 400 })
    }

    const amount = refundable.reduce((s, o) => s + o.totalPaid, 0)
    const ids = refundable.map(o => o.id)

    // 1. 先打 TapPay refund（整捆共用同一 recTradeId；單張＝對該交易部分退款）— 失敗即 abort、DB 不動
    const refund = await tapPayRefund(focus.tapPayRecTradeId, amount)
    if (!refund.ok) {
      return NextResponse.json({ error: `TapPay 退款失敗：${refund.message ?? '未知錯誤'}` }, { status: 502 })
    }

    // 2. 訂單轉 REFUNDED
    await prisma.order.updateMany({ where: { id: { in: ids } }, data: { status: OrderStatus.REFUNDED } })

    return NextResponse.json({
      ok: true,
      refundedAmount: amount,
      refundedCount: ids.length,
    })
  }

  return NextResponse.json({ error: 'action 無效' }, { status: 400 })
}
