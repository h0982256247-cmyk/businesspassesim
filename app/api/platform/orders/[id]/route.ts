import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { safeDecrypt } from '@/lib/utils/crypto'
import { decryptEsimFields } from '@/lib/utils/esim-crypto'
import { retryEsimActivation } from '@/lib/services/esim'
import { tapPayRefund, tapPayGatewayFor } from '@/lib/services/tappay'
import { processingFee } from '@/lib/utils/payment-fee'
import { OrderStatus } from '@prisma/client'
import { allowedFromFor } from '@/lib/services/order-transition'
import { recordAlert } from '@/lib/services/alert'

// 補發會同步呼叫世界移動（查詢或下單），退款會呼叫 TapPay → 比照其他外呼路由拉高上限
export const maxDuration = 60

// 退款可生效的狀態（已實際扣款者）
const REFUNDABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.COMPLETED,
  OrderStatus.ESIM_PENDING,
]

type Params = { params: Promise<{ id: string }> }

// ─── 退款打款的樂觀鎖 ─────────────────────────────────────────────
// 退款是「先呼叫 TapPay 再寫 DB」，中間隔著一次外部請求；兩個並發請求（重複點擊、
// 兩個分頁）都會讀到同一份 refundedAmount，各自打一次款。用 refundedAmount 當版本號
// 做 compare-and-set：where 帶讀到的舊值，只有 count===1 的那一個能真的去打款。
async function claimRefundAmount(orderId: string, expected: number, amount: number): Promise<boolean> {
  const r = await prisma.order.updateMany({
    where: { id: orderId, refundedAmount: expected },
    data: { refundedAmount: expected + amount },
  })
  return r.count === 1
}

// 打款失敗的補償：把預先記上的金額扣回去（帶 gte 條件，不會扣成負數）
async function releaseRefundAmount(orderId: string, amount: number): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, refundedAmount: { gte: amount } },
    data: { refundedAmount: { decrement: amount } },
  })
}

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
      receipt: { select: { receiptNumber: true } },
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
      receiptNumber: order.receipt?.receiptNumber ?? null,
      // 金流手續費（未付款→null 顯示「—」；全退→0；部分退→以留存計）。信用卡依發卡國別 國內2.2%/國外2.8%。
      processingFee: processingFee({ paymentMethod: order.paymentMethod, totalPaid: order.totalPaid, paidAt: order.paidAt, cardIssuerCountry: order.cardIssuerCountry, status: order.status, refundedAmount: order.refundedAmount }),
    },
    // eSIM 憑證欄位在 DB 加密；後台客服需要看明文（補發、對帳），解密後回傳。
    esims: esims.map(decryptEsimFields),
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
    const order = await prisma.order.findFirst({
      where: { id },
      select: { status: true, wmOrderId: true, supplierOrderClaimedAt: true },
    })
    if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
    // 補發對象：付款成功但尚未發卡（PAID；含下單失敗的訂單）。ESIM_PENDING 保留以相容歷史。
    // retryEsimActivation 內部具冪等守門（wmOrderId 已存在則略過），重複觸發安全。
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.ESIM_PENDING) {
      return NextResponse.json({ error: '只有「付款成功但尚未發卡」的訂單可補發' }, { status: 409 })
    }
    // 已對供應商送出下單但結果未知（有 claim、無 wmOrderId）：系統不會自動重下單，
    // 這裡也必須明白告訴管理員需要人工對帳，不能回「已觸發」讓人以為處理中（P0-3）。
    if (!order.wmOrderId && order.supplierOrderClaimedAt) {
      return NextResponse.json({
        error: '此訂單已於 ' + order.supplierOrderClaimedAt.toISOString() + ' 對供應商送出下單，但結果未知。'
          + '系統不會自動重下單，以免重複購卡。請先到世界移動後台確認該筆是否已成立，'
          + '再請工程人員回填供應商訂單編號（已成立）或清除下單佔用（未成立）。',
      }, { status: 409 })
    }
    // 必須 await：retryEsimActivation 會先寫 supplierOrderClaimedAt 搶佔再呼叫供應商，
    // fire-and-forget 在 Vercel 回應後可能被凍結在「已 claim、未下單」——那批訂單會同時
    // 被自動重試與這顆按鈕排除，只能改 DB 才救得回來。錯誤也不可靜默吞掉。
    try {
      await retryEsimActivation(id)
    } catch (e) {
      console.error('[platform] retryEsimActivation failed', id, e)
      await recordAlert('esim_activation_failed', {
        orderId: id, source: 'admin_retry',
        error: e instanceof Error ? e.message : String(e),
      })
      return NextResponse.json({ error: '補發執行失敗，已記錄告警，請查看系統警示' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, message: '已執行補發流程' })
  }

  // 退款：'refund'=單張全退 / 'refund_bundle'=整捆全退 / 'refund_partial'=自訂金額部分退
  if (action === 'refund' || action === 'refund_bundle' || action === 'refund_partial') {
    const isBundleAction = action === 'refund_bundle'
    const isPartial = action === 'refund_partial'

    // 焦點訂單：取 bundleId / 共用的 recTradeId / 已累計部分退金額
    const focus = await prisma.order.findFirst({
      where: { id },
      // paymentMethod：退款要用該訂單實際付款的商店設定（信用卡／LINE Pay 不同 merchant）
      select: { id: true, bundleId: true, tapPayRecTradeId: true, refundedAmount: true, paymentMethod: true },
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
      // 先記帳再打款（樂觀鎖）：refundedAmount 當版本號，where 帶讀到的舊值，
      // 兩次並發只有一個 count===1。少了這一步，重複點擊會對同一筆交易退兩次。
      const claimed = await claimRefundAmount(focus.id, focus.refundedAmount, amt)
      if (!claimed) {
        return NextResponse.json({ error: '退款已在處理中或金額已變更，請重新整理後再試' }, { status: 409 })
      }
      const refund = await tapPayRefund(focus.tapPayRecTradeId, amt, tapPayGatewayFor(focus.paymentMethod))
      if (!refund.ok) {
        // 打款沒成功 → 把預記的金額扣回去，否則可退餘額會憑空變少
        await releaseRefundAmount(focus.id, amt)
        return NextResponse.json({ error: `TapPay 退款失敗：${refund.message ?? '未知錯誤'}` }, { status: 502 })
      }
      // 退到滿額（連同已整張退的）→ 整個交易的可退 eSIM 標為 REFUNDED
      if (amt === remaining) {
        const ids = groupOrders.filter(o => REFUNDABLE_STATUSES.includes(o.status)).map(o => o.id)
        if (ids.length > 0) await prisma.order.updateMany({
          where: { id: { in: ids }, status: { in: allowedFromFor(OrderStatus.REFUNDED) } },
          data: { status: OrderStatus.REFUNDED },
        })
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

    // 先記帳再打款（樂觀鎖，同部分退款）：擋掉重複點擊造成的兩次退款。
    // 已被部分退到 0 則略過打款，仍標 REFUNDED。
    if (amount > 0) {
      const claimed = await claimRefundAmount(focus.id, focus.refundedAmount, amount)
      if (!claimed) {
        return NextResponse.json({ error: '退款已在處理中或金額已變更，請重新整理後再試' }, { status: 409 })
      }
      const refund = await tapPayRefund(focus.tapPayRecTradeId, amount, tapPayGatewayFor(focus.paymentMethod))
      if (!refund.ok) {
        await releaseRefundAmount(focus.id, amount)
        return NextResponse.json({ error: `TapPay 退款失敗：${refund.message ?? '未知錯誤'}` }, { status: 502 })
      }
    }
    // ids 是上面「讀出來再過濾」的結果（TOCTOU）：where 再帶一次合法前狀態，
    // 期間已被其他流程改成 REFUNDED 的訂單不會被重複覆蓋。
    const marked = await prisma.order.updateMany({
      where: { id: { in: ids }, status: { in: allowedFromFor(OrderStatus.REFUNDED) } },
      data: { status: OrderStatus.REFUNDED },
    })
    if (marked.count !== ids.length) {
      console.warn('[platform-refund] 部分訂單期間已變更狀態', { focusId: focus.id, expected: ids.length, marked: marked.count })
    }
    // refundedAmount 已在打款前的樂觀鎖記帳，這裡不再重複累加

    return NextResponse.json({
      ok: true,
      refundedAmount: Math.max(amount, 0),
      refundedCount: ids.length,
    })
  }

  return NextResponse.json({ error: 'action 無效' }, { status: 400 })
}
