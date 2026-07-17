import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifySession, SESSION_COOKIE, type SessionPayload } from '@/lib/auth/session'

// LIFF 使用者 route 的統一驗證守門（對應 platform 的 requirePlatformAuth）。
// 一次完成：驗 SESSION_COOKIE + 解析 userId / lineUid / tenantAdminId（含舊 token
// 的 DB fallback），統一錯誤格式。用法與 requirePlatformAuth 相同：
//
//   const auth = await requireLiffAuth(req)
//   if (auth instanceof NextResponse) return auth
//   // auth.userId / auth.lineUid / auth.tenantAdminId 可直接使用
//
// 注意：訪客可瀏覽的端點（如 /api/products、/api/liff/payment-config）不要用這支
// （它對未登入一律 401）；那些請繼續用 resolveTenantAdminIdFromToken。
export interface LiffAuth {
  userId: string
  lineUid: string
  tenantAdminId: string | null
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

  // 統一 tenantAdminId 解析：JWT 有帶就用（新 token，省一次 DB）；舊 token 沒帶 → DB fallback
  let tenantAdminId = session.tenantAdminId ?? null
  if (session.tenantAdminId === undefined) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { tenantAdminId: true },
    })
    tenantAdminId = user?.tenantAdminId ?? null
  }

  return { userId: session.userId, lineUid: session.lineUid, tenantAdminId, session }
}
