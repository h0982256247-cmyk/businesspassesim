import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getCompanyById, getCompanyMembers, setCompanyAdmin, setCompanyActive } from '@/lib/services/group'
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

// PATCH /api/admin/groups/:id — 指派/變更管理員（adminUserId）或啟用/停權（isActive）
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  // 指派管理員：傳入 LINE User id；空字串/null 為取消指派
  if (body.adminUserId !== undefined) {
    await setCompanyAdmin(id, body.adminUserId || null)
    return NextResponse.json({ ok: true })
  }

  if (typeof body.isActive === 'boolean') {
    await setCompanyActive(id, body.isActive)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效請求' }, { status: 400 })
}
