import { NextRequest, NextResponse } from 'next/server'
import { verifyLineIdToken, channelIdFromLiffId } from '@/lib/auth/line'
import { createSession, SESSION_COOKIE } from '@/lib/auth/session'
import { findOrCreateUser, isProfileComplete } from '@/lib/services/user'
import { getPlatformSettings } from '@/lib/services/tenant-config'

// POST /api/auth/line
// Body: { idToken: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const idToken: string | undefined = body?.idToken

  if (!idToken) {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 })
  }

  // LINE Login channel ID 由後台 LIFF ID 拆出（{channelId}-...）驗證 id_token，
  // 換帳號只需改後台 LIFF ID、不必動 env；後台未設時 fallback 到 LINE_CHANNEL_ID env。
  let lineInfo
  try {
    const { liffId } = await getPlatformSettings()
    lineInfo = await verifyLineIdToken(idToken, channelIdFromLiffId(liffId))
  } catch {
    return NextResponse.json({ error: 'Invalid LINE token' }, { status: 401 })
  }

  const { user, isNewUser } = await findOrCreateUser(lineInfo)
  const profileComplete = isProfileComplete(user)
  const sessionToken = await createSession({
    userId: user.id,
    lineUid: user.lineUid,
  })

  const res = NextResponse.json({
    user: { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, profileComplete },
    isNewUser,
    profileComplete,
  })

  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return res
}
