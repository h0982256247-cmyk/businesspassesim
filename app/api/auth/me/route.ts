import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { getUserById, isProfileComplete } from '@/lib/services/user'

// GET /api/auth/me
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let session
  try {
    session = await verifySession(token)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const user = await getUserById(session.userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // 已退出（leftAt 有值）不算現任會員；否則個人頁標頭/選單仍顯示「企業會員」。
  // 與 getUserMembership、isApprovedMember 過濾 leftAt 的語意一致。
  const gm = user.groupMembership
  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      profileComplete: isProfileComplete(user),
    },
    // 企業歸屬 + 審核狀態（前端據此顯示福利價資格）
    membership: gm && !gm.leftAt
      ? { status: gm.status, group: gm.group }
      : null,
  })
}
