import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE, type SessionPayload } from '@/lib/auth/session'

// LIFF 使用者 route 的統一驗證守門（對應 platform 的 requirePlatformAuth）。
// 一次完成：驗 SESSION_COOKIE + 解析 userId / lineUid，統一錯誤格式。用法：
//
//   const auth = await requireLiffAuth(req)
//   if (auth instanceof NextResponse) return auth
//   // auth.userId / auth.lineUid 可直接使用
//
// 注意：訪客可瀏覽的端點（如 /api/products）不要用這支（它對未登入一律 401）。
export interface LiffAuth {
  userId: string
  lineUid: string
  session: SessionPayload
}

export async function requireLiffAuth(req: NextRequest): Promise<LiffAuth | NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session: SessionPayload
  try {
    session = await verifySession(token)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  return { userId: session.userId, lineUid: session.lineUid, session }
}
