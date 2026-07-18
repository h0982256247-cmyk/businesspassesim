import { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from './session'
import { isApprovedMember } from '@/lib/services/group'

// 瀏覽情境的「可選會員身分」：未登入 / 驗證失敗 → 非會員（看一般售價）。
// 已登入且為已核准企業會員 → isMember=true（看福利價）。
// 商品瀏覽端點用這支決定要不要回傳福利價（非會員不回，避免外洩企業價）。
export async function resolveViewerMember(
  req: NextRequest,
): Promise<{ userId: string | null; isMember: boolean }> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return { userId: null, isMember: false }
  try {
    const s = await verifySession(token)
    const m = await isApprovedMember(s.userId)
    return { userId: s.userId, isMember: m.isMember }
  } catch {
    return { userId: null, isMember: false }
  }
}
