import { NextRequest, NextResponse } from 'next/server'
import { getGiftByToken } from '@/lib/services/gift'

// GET /api/gifts/[token]  — recipient 預覽（不需登入即可看商品資訊，但不揭露 QR/兌換碼）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gift = await getGiftByToken(token)
  if (!gift) return NextResponse.json({ error: '分享連結無效' }, { status: 404 })

  const now = new Date()
  const status = gift.cancelledAt
    ? 'CANCELLED'
    : gift.claimedAt
      ? 'CLAIMED'
      : gift.expiresAt < now
        ? 'EXPIRED'
        : 'PENDING'

  const item = gift.order.orderItems[0]
  return NextResponse.json({
    status,
    sharedAt:    gift.sharedAt.toISOString(),
    expiresAt:   gift.expiresAt.toISOString(),
    claimedAt:   gift.claimedAt?.toISOString() ?? null,
    fromUserId:  gift.fromUserId,
    fromName:    gift.fromUser.displayName,
    product: item ? {
      name:        item.productName,
      countryCode: item.product?.countryCode ?? null,
      countryFlag: item.product?.countryFlag ?? null,
      dataCapacity: item.product?.dataCapacity ?? null,
      displayDays: item.product?.displayDays ?? null,
    } : null,
  })
}
