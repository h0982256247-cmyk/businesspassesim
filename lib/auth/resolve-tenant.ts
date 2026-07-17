import { prisma } from '@/lib/db/prisma'
import { verifySession } from '@/lib/auth/session'

// 從 session token 解出 tenantAdminId。
//
// 邏輯：
//   1. 無 token → null（未登入訪客看全平台商品）
//   2. token 解開後 payload 已含 tenantAdminId → 直接回（省一次 DB roundtrip）
//   3. 舊版 token 沒帶 tenantAdminId → 退回 prisma.user.findUnique（向後相容）
//   4. 驗證失敗 → null
//
// 設計理由：使用者註冊後 tenantAdminId 幾乎不會變動（findOrCreateUser 只在
// 尚未設定時寫入），所以在 JWT 裡帶這個欄位是安全的。把這個邏輯集中在
// 一個 helper 讓所有 API route 共用，並讓單元測試直接覆蓋這條 fallback 分支。

export async function resolveTenantAdminIdFromToken(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null

  let session
  try {
    session = await verifySession(token)
  } catch {
    return null
  }

  if (session.tenantAdminId !== undefined) {
    return session.tenantAdminId ?? null
  }

  // 舊版 token：fallback 查 DB
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tenantAdminId: true },
  })
  return user?.tenantAdminId ?? null
}
