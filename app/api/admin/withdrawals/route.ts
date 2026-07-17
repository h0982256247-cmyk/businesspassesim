import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllWithdrawalsForAdmin } from '@/lib/services/withdrawal'

// GET /api/admin/withdrawals — admin 查所有提領申請（tenant-scoped）
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  // SUPER_ADMIN 預設看全部，亦可用 tenantAdminId 下鑽到單一白牌；其餘角色一律鎖自己租戶。
  const tenantAdminId = auth.role === 'SUPER_ADMIN'
    ? (req.nextUrl.searchParams.get('tenantAdminId') || null)
    : auth.tenantAdminId

  const withdrawals = await getAllWithdrawalsForAdmin(tenantAdminId)
  return NextResponse.json({ withdrawals })
}
