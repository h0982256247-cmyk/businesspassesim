import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { getUserCouponsIncludingUsed } from '@/lib/services/coupon'

// GET /api/coupons  — 我的所有優惠券（含已使用）
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const coupons = await getUserCouponsIncludingUsed(session.userId)
  return NextResponse.json({ coupons })
}
