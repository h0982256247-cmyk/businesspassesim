import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { leaveGroup } from '@/lib/services/group'

// POST /api/groups/leave
// 退出目前所屬社群，並讓該社群發出的未使用券立即過期
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const result = await leaveGroup(session.userId)
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 })

  return NextResponse.json({
    ok: true,
    groupName: result.groupName,
    expiredCoupons: result.expiredCoupons,
  })
}
