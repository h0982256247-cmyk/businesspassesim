import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getCompanyById, getCompanyMembers, setMemberAdmin, setCompanyActive, deleteCompany } from '@/lib/services/group'
import { AdminRole } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// GET /api/admin/groups/:id — 企業詳情 + 成員清單（Super Admin 指派管理員用）
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params
  const [company, members] = await Promise.all([getCompanyById(id), getCompanyMembers(id)])
  if (!company) return NextResponse.json({ error: '企業不存在' }, { status: 404 })

  return NextResponse.json({ company, members })
}

// PATCH /api/admin/groups/:id — 設定/移除某成員管理員（userId + makeAdmin，可多位）或啟用/停權（isActive）
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  // 設定/移除某成員的企業管理員身分（一企業可多位管理員）
  if (typeof body.makeAdmin === 'boolean' && body.userId) {
    const r = await setMemberAdmin(id, body.userId, body.makeAdmin)
    if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 409 })
    return NextResponse.json({ ok: true })
  }

  if (typeof body.isActive === 'boolean') {
    await setCompanyActive(id, body.isActive)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效請求' }, { status: 400 })
}

// DELETE /api/admin/groups/:id — 刪除企業（有訂單則擋，回 409）
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params
  const result = await deleteCompany(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.reason === '企業不存在' ? 404 : 409 })
  }
  return NextResponse.json({ ok: true })
}
