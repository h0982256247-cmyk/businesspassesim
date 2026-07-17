import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { settleCommissions } from '@/lib/services/commission'
import { prisma } from '@/lib/db/prisma'

// POST /api/admin/commissions/settle
// Body: { groupId, period }  period = "YYYY-MM"
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { groupId, period } = await req.json()

  if (!groupId || !period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'groupId 與 period (YYYY-MM) 必填' }, { status: 400 })
  }

  // 租戶隔離：非 SUPER_ADMIN（tenantAdminId 非 null）只能結算自己租戶的社群
  if (auth.tenantAdminId) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { tenantAdminId: true } })
    if (!group || group.tenantAdminId !== auth.tenantAdminId) {
      return NextResponse.json({ error: '無權結算此社群' }, { status: 403 })
    }
  }

  await settleCommissions(groupId, period)
  return NextResponse.json({ ok: true })
}
