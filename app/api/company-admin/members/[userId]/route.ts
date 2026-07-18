import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { approveMember, rejectMember, removeMember } from '@/lib/services/group'

type Params = { params: Promise<{ userId: string }> }

// PATCH /api/company-admin/members/:userId — 審核（body: { action: 'approve' | 'reject' }）
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { userId: targetUserId } = await params
  const { action } = await req.json()

  try {
    if (action === 'approve') await approveMember(auth.userId, targetUserId)
    else if (action === 'reject') await rejectMember(auth.userId, targetUserId)
    else return NextResponse.json({ error: 'action 無效' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    // assertCompanyAdmin 失敗（非管理員 / 找不到成員）→ 403
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失敗' }, { status: 403 })
  }
}

// DELETE /api/company-admin/members/:userId — 移除成員
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { userId: targetUserId } = await params
  try {
    await removeMember(auth.userId, targetUserId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失敗' }, { status: 403 })
  }
}
