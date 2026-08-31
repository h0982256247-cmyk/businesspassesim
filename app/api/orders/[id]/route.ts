import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getOrderByIdForUser, markOrderCancelled, isOrderExpired } from '@/lib/services/order'
import { OrderStatus } from '@prisma/client'

// GET /api/orders/:id — 訂單詳情（PENDING 逾時自動取消）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const order = await getOrderByIdForUser(id, auth.userId)

  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  // 懶取消：PENDING 超過 30 分鐘靜默取消。讀到 PENDING 之後、寫入之前訂單仍可能
  // 剛付款成功（TOCTOU），故以條件式轉移的結果為準：擋下來就照實回原狀態，
  // 不可回一個沒有真的寫進 DB 的 CANCELLED 給前端。
  if (order.status === OrderStatus.PENDING && isOrderExpired(order.createdAt)) {
    const cancelled = await markOrderCancelled(id)
    if (cancelled.ok) return NextResponse.json({ order: { ...order, status: 'CANCELLED' } })
  }

  return NextResponse.json({ order })
}
