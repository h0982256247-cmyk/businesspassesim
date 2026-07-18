import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getDashboardStats } from '@/lib/services/platform-admin'

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const stats = await getDashboardStats()
    return NextResponse.json({ ...stats, role: auth.role })
  } catch (e) {
    // 不靜默吞錯：記到伺服器日誌、回傳可見錯誤（前端顯示錯誤卡＋重試），不再讓頁面變空白。
    console.error('[platform/dashboard] getDashboardStats failed:', e)
    return NextResponse.json({ error: '儀表板暫時無法載入，請稍後再試' }, { status: 500 })
  }
}
