import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { batchIssueCoupons } from '@/lib/services/coupon'
import { CouponType } from '@prisma/client'

// POST /api/admin/coupons  — 批量發券
// Body: { userIds, type, discount, isOfficial?, sourceGroupId?, expiresAt? }
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { userIds, type, discount, isOfficial, sourceGroupId, expiresAt } = body

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'userIds 不可為空' }, { status: 400 })
  }
  if (!Object.values(CouponType).includes(type)) {
    return NextResponse.json({ error: 'type 無效' }, { status: 400 })
  }
  if (typeof discount !== 'number' || discount <= 0 || discount >= 1) {
    return NextResponse.json({ error: 'discount 必須介於 0 ~ 1 之間' }, { status: 400 })
  }

  const result = await batchIssueCoupons({
    userIds,
    type,
    discount,
    isOfficial: isOfficial ?? false,
    sourceGroupId: sourceGroupId ?? undefined,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  })

  return NextResponse.json({ message: `成功發出 ${result.count} 張優惠券` })
}
