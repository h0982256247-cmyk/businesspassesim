import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { rejectGroup } from '@/lib/services/group'

// POST /api/admin/groups/:id/reject
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { note } = await req.json().catch(() => ({}))

  try {
    const group = await rejectGroup(id, note, auth.tenantAdminId)
    return NextResponse.json({ group })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '審核失敗'
    const status = message.includes('無權') ? 403 : 422
    return NextResponse.json({ error: message }, { status })
  }
}
