import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllPendingCommissions } from '@/lib/services/commission'

// GET /api/admin/commissions — 所有待結算分潤
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const tenantAdminId = auth.role === 'SUPER_ADMIN'
    ? (req.nextUrl.searchParams.get('tenantAdminId') || null)
    : auth.tenantAdminId

  const commissions = await getAllPendingCommissions(tenantAdminId)
  return NextResponse.json({ commissions })
}
