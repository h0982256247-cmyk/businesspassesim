import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import {
  validateCouponOwnership,
  validateCouponCombination,
  calculateFinalPrice,
} from '@/lib/services/coupon'

// POST /api/coupons/validate
// Body: { couponIds: string[], productPrice: number }
// Returns: { valid, finalPrice, discounts, reason? }
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const body = await req.json()
  const { couponIds, productPrice } = body as { couponIds: string[]; productPrice: number }

  if (!Array.isArray(couponIds) || typeof productPrice !== 'number') {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  if (couponIds.length === 0) {
    return NextResponse.json({ valid: true, finalPrice: productPrice, discounts: [] })
  }

  // 驗證每張券的所有權與有效性
  const validatedCoupons = []
  for (const id of couponIds) {
    const result = await validateCouponOwnership(id, session.lineUid)
    if (!result.ok) {
      return NextResponse.json({ valid: false, reason: `券 ${id}：${result.reason}` }, { status: 422 })
    }
    validatedCoupons.push(result.coupon)
  }

  // 驗證組合規則
  const discounts = validatedCoupons.map(c => c.discount)
  const combo = validateCouponCombination(discounts)
  if (!combo.valid) {
    return NextResponse.json({ valid: false, reason: combo.reason }, { status: 422 })
  }

  const finalPrice = calculateFinalPrice(productPrice, discounts)

  return NextResponse.json({
    valid: true,
    finalPrice,
    discounts,
    coupons: validatedCoupons.map(c => ({ id: c.id, discount: c.discount, level: c.level })),
  })
}
