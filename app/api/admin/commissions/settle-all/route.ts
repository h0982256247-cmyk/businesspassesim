import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { settleCommissions } from '@/lib/services/commission'
import { GroupStatus } from '@prisma/client'

// POST /api/admin/commissions/settle-all
// Body: { period }  period = "YYYY-MM"
// 對 tenant 內所有 APPROVED 社群執行月結；個別失敗不影響其他社群。
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { period } = await req.json()
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period (YYYY-MM) 必填' }, { status: 400 })
  }

  const groups = await prisma.group.findMany({
    where: {
      status: GroupStatus.APPROVED,
      ...(auth.tenantAdminId ? { tenantAdminId: auth.tenantAdminId } : {}),
    },
    select: { id: true, name: true },
  })

  let settled = 0
  let skipped = 0
  const errors: { groupName: string; error: string }[] = []

  for (const g of groups) {
    try {
      // settleCommissions 內部會檢查是否有 PENDING commission；無則自動跳過
      await settleCommissions(g.id, period)
      settled++
    } catch (err) {
      const msg = err instanceof Error ? err.message : '結算失敗'
      errors.push({ groupName: g.name, error: msg })
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    totalGroups: groups.length,
    settled,
    skipped,
    errors,
  })
}
