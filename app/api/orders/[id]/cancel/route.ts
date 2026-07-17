import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getOrderByIdForUser, markOrderCancelled, markBundleFailed } from '@/lib/services/order'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus } from '@prisma/client'

// POST /api/orders/:id/cancel — 使用者手動取消尚未付款成功的訂單
//
// 情境：LINE Pay 取消或 3DS 視窗關閉後，TapPay notify webhook 可能延遲幾秒
// 才送達；訂單卡在 PROCESSING 看起來像「待付款轉圈圈」。給使用者一個按鈕
// 立即把訂單標記為 CANCELLED，不必等 webhook 或 30 分鐘 cron。
//
// 安全考量：若 user 點完取消後 TapPay 才回 status=0（payment 真的成功），
// notify webhook 已經有保護（看到 order = CANCELLED 會自動觸發退款），
// 詳見 app/api/payment/tappay/notify/route.ts。
//
// 不允許取消已 PAID/ESIM_PENDING/COMPLETED/REFUNDED 的訂單。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const order = await getOrderByIdForUser(id, auth.userId)
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  const CANCELLABLE: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PROCESSING]
  if (!CANCELLABLE.includes(order.status)) {
    return NextResponse.json(
      { error: `訂單目前狀態為 ${order.status}，無法取消（已付款／處理中）` },
      { status: 409 },
    )
  }

  const reason = '使用者手動取消（金流頁取消或關閉）'

  // bundle：把整組 PENDING/PROCESSING 改 FAILED（與 webhook 同條路徑，保留
  // 共用 schema 語意）— bundle 用 markBundleFailed 內已 reset coupons
  if (order.bundleId) {
    const bundleOrders = await prisma.order.findMany({
      where: { bundleId: order.bundleId, currentOwnerId: auth.userId },
      select: { id: true, status: true },
    })
    if (bundleOrders.some(o => !(CANCELLABLE as readonly string[]).includes(o.status))) {
      return NextResponse.json(
        { error: '此組合訂單已有部分付款完成，請聯絡客服處理' },
        { status: 409 },
      )
    }
    // Bundle 也走 CANCELLED 語意（手動取消 ≠ 付款失敗），用 markOrderCancelled
    // 個別處理，並寫入 cancelReason
    await prisma.$transaction(async tx => {
      await tx.order.updateMany({
        where: { bundleId: order.bundleId!, status: { in: CANCELLABLE } },
        data: { status: OrderStatus.CANCELLED, cancelReason: reason },
      })
      const ids = bundleOrders.map(o => o.id)
      await tx.coupon.updateMany({
        where: { usedOrderId: { in: ids } },
        data: { usedAt: null, usedOrderId: null },
      })
    })
  } else {
    await markOrderCancelled(order.id, reason)
  }

  return NextResponse.json({ ok: true })
}

// 為了讓未來改用 markBundleFailed 行為一致，把 import 留著
void markBundleFailed
