import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { approveWithdrawal, rejectWithdrawal, markWithdrawalPaid } from '@/lib/services/withdrawal'

// PATCH /api/admin/withdrawals/[id]
// Body: { action: 'approve' | 'reject' | 'pay', note?: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { action, note } = await req.json()

  // tenant 守門：非 SUPER_ADMIN 只能動自己 tenant 的提領
  if (auth.tenantAdminId != null) {
    const w = await prisma.withdrawal.findUnique({
      where: { id },
      select: { group: { select: { tenantAdminId: true } } },
    })
    if (!w || w.group.tenantAdminId !== auth.tenantAdminId) {
      return NextResponse.json({ error: '無權操作此提領申請' }, { status: 403 })
    }
  }

  try {
    if (action === 'approve') {
      await approveWithdrawal(id, note)
    } else if (action === 'reject') {
      await rejectWithdrawal(id, note)
    } else if (action === 'pay') {
      await markWithdrawalPaid(id, note)
    } else {
      return NextResponse.json({ error: 'action 必須為 approve|reject|pay' }, { status: 400 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '操作失敗'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
