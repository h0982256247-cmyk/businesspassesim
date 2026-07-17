import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getDashboardStats } from '@/lib/services/platform-admin'

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  // SUPER_ADMIN 可用 tenantAdminId 下鑽到單一白牌；其餘角色一律鎖自己租戶。
  const tenantAdminId = auth.role === 'SUPER_ADMIN'
    ? (req.nextUrl.searchParams.get('tenantAdminId') || null)
    : auth.tenantAdminId

  try {
    const stats = await getDashboardStats(tenantAdminId)
    // role 給前端判斷是否顯示「開站進度」（Super Admin 不顯示）。
    return NextResponse.json({ ...stats, role: auth.role })
  } catch (e) {
    // 不靜默吞錯：記到伺服器日誌、回傳可見錯誤（前端顯示錯誤卡＋重試），不再讓頁面變空白。
    console.error('[platform/dashboard] getDashboardStats failed:', e)
    return NextResponse.json({ error: '儀表板暫時無法載入，請稍後再試' }, { status: 500 })
  }
}
