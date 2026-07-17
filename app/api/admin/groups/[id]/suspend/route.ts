import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { suspendGroup } from '@/lib/services/group'

// POST /api/admin/groups/[id]/suspend
// 停權社群：status → SUSPENDED，所有未使用券立即作廢
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const note = typeof body?.note === 'string' ? body.note : undefined

  try {
    const result = await suspendGroup(id, auth.tenantAdminId, note)
    return NextResponse.json({ ok: true, voidedCoupons: result.voidedCoupons })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '停權失敗'
    return NextResponse.json({ error: msg }, { status: 403 })
  }
}
