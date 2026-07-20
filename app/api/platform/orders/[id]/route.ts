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
  const body = await req.json()
  const action = body.action as string

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

  // 退款：'refund'=單張全退 / 'refund_bundle'=整捆全退 / 'refund_partial'=自訂金額部分退
  if (action === 'refund' || action === 'refund_bundle' || action === 'refund_partial') {
    const isBundleAction = action === 'refund_bundle'
    const isPartial = action === 'refund_partial'

    // 焦點訂單：取 bundleId / 共用的 recTradeId / 已累計部分退金額
    const focus = await prisma.order.findFirst({
      where: { id },
      select: { id: true, bundleId: true, tapPayRecTradeId: true, refundedAmount: true },
    })
    if (!focus) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
    if (!focus.tapPayRecTradeId) {
      return NextResponse.json({ error: '此訂單無 TapPay 交易紀錄，無法自動退款。請手動處理。' }, { status: 400 })
    }

    // 交易群組：整捆 / 部分退 → 同 bundleId 全部；單張全退 → 僅本筆
    const groupOrders = await prisma.order.findMany({
      where: (isBundleAction || isPartial) && focus.bundleId ? { bundleId: focus.bundleId } : { id: focus.id },
      select: { id: true, status: true, totalPaid: true },
    })

    if (isPartial) {
      // 自訂金額部分退款：對交易做部分退，記累計 refundedAmount；不改 eSIM 狀態（仍可用）。
      // 可退餘額 = 交易總額 − 已整張退掉的金額 − 已累計部分退金額（避免超退）。
      const amt = Math.floor(Number(body.amount))
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json({ error: '退款金額須大於 0' }, { status: 400 })
      }
      const txnTotal = groupOrders.reduce((s, o) => s + o.totalPaid, 0)
      const refundedOrdersSum = groupOrders.filter(o => o.status === OrderStatus.REFUNDED).reduce((s, o) => s + o.totalPaid, 0)
      const remaining = txnTotal - refundedOrdersSum - focus.refundedAmount
      if (remaining <= 0) {
        return NextResponse.json({ error: '此交易已無可退餘額' }, { status: 409 })
      }
      if (amt > remaining) {
        return NextResponse.json({ error: `超過可退餘額（最多可退 NT$${remaining.toLocaleString()}）` }, { status: 400 })
      }
      const refund = await tapPayRefund(focus.tapPayRecTradeId, amt)
      if (!refund.ok) {
        return NextResponse.json({ error: `TapPay 退款失敗：${refund.message ?? '未知錯誤'}` }, { status: 502 })
      }
      const newRefunded = focus.refundedAmount + amt
      await prisma.order.update({ where: { id: focus.id }, data: { refundedAmount: newRefunded } })
      // 退到滿額（連同已整張退的）→ 整個交易的可退 eSIM 標為 REFUNDED
      if (amt === remaining) {
        const ids = groupOrders.filter(o => REFUNDABLE_STATUSES.includes(o.status)).map(o => o.id)
        if (ids.length > 0) await prisma.order.updateMany({ where: { id: { in: ids } }, data: { status: OrderStatus.REFUNDED } })
      }
      return NextResponse.json({ ok: true, refundedAmount: amt, remaining: remaining - amt })
    }

    // 全退（單張 / 整捆）：退「可退 eSIM 合計 − 已累計部分退」，並標 REFUNDED
    const refundable = groupOrders.filter(o => REFUNDABLE_STATUSES.includes(o.status))
    if (refundable.length === 0) {
      return NextResponse.json({ error: '沒有可退款的 eSIM（可能已退款或未付款）' }, { status: 409 })
    }
    const amount = refundable.reduce((s, o) => s + o.totalPaid, 0) - focus.refundedAmount
    const ids = refundable.map(o => o.id)

    // 先打 TapPay refund（已被部分退到 0 則略過打款，仍標 REFUNDED）— 失敗即 abort、DB 不動
    if (amount > 0) {
      const refund = await tapPayRefund(focus.tapPayRecTradeId, amount)
      if (!refund.ok) {
        return NextResponse.json({ error: `TapPay 退款失敗：${refund.message ?? '未知錯誤'}` }, { status: 502 })
      }
    }
    await prisma.order.updateMany({ where: { id: { in: ids } }, data: { status: OrderStatus.REFUNDED } })
    if (amount > 0) await prisma.order.update({ where: { id: focus.id }, data: { refundedAmount: { increment: amount } } })

    return NextResponse.json({
      ok: true,
      refundedAmount: Math.max(amount, 0),
      refundedCount: ids.length,
    })
  }

  return NextResponse.json({ error: 'action 無效' }, { status: 400 })
}
