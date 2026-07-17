import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getOrderByIdForUser, markOrderCancelled, isOrderExpired } from '@/lib/services/order'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus } from '@prisma/client'

// GET /api/orders/:id — 訂單詳情（PENDING 逾時自動取消）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const order = await getOrderByIdForUser(id, auth.userId)

  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  // 懶取消：PENDING 超過 30 分鐘靜默取消
  if (order.status === OrderStatus.PENDING && isOrderExpired(order.createdAt)) {
    await markOrderCancelled(id)
    return NextResponse.json({ order: { ...order, status: 'CANCELLED' }, repurchaseCoupon: null })
  }

  // 本筆是否已回饋回購券（結帳完成慶祝用）：查該訂單發出的 GROUP_REPURCHASE 券。
  const repurchase = await prisma.coupon.findFirst({
    where: { sourceOrderId: id, type: 'GROUP_REPURCHASE', ownerId: auth.userId },
    select: { discount: true },
  })
  const repurchaseCoupon = repurchase ? { discount: Number(repurchase.discount) } : null

  return NextResponse.json({ order, repurchaseCoupon })
}
