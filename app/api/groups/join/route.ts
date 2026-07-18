import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { joinByInviteCode } from '@/lib/services/group'

// POST /api/groups/join
// Body: { inviteCode } — 員工輸入企業邀請碼送出加入申請（進入待審核 PENDING）
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { inviteCode } = await req.json()
  if (!inviteCode?.trim()) return NextResponse.json({ error: 'inviteCode 必填' }, { status: 400 })

  const result = await joinByInviteCode(session.userId, inviteCode.trim().toUpperCase())

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 422 })
  }

  // 加入申請已送出，待企業管理員審核
  return NextResponse.json({ ok: true, companyName: result.companyName, status: result.status })
}
