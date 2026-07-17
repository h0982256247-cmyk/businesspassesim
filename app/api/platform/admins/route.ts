import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllAdmins, createAdmin } from '@/lib/services/platform-admin'
import { PlatformAdminRole } from '@prisma/client'

// GET /api/platform/admins
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== PlatformAdminRole.SUPER_ADMIN && auth.role !== PlatformAdminRole.PLATFORM_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const admins = await getAllAdmins(auth.adminId, auth.role)
  return NextResponse.json({ admins })
}

// POST /api/platform/admins — 建立帳號
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  // 只有 SUPER_ADMIN / PLATFORM_ADMIN 可建立帳號；SUB_ADMIN 不得建立任何管理員
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN && auth.role !== PlatformAdminRole.PLATFORM_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { email, password, name, role, modules, parentId: bodyParentId, tenantSlug, brandName, liffId, primaryColor } = await req.json()

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: '必填欄位缺漏' }, { status: 400 })
  }

  // 權限控管：只有 SUPER_ADMIN 可建 SUPER_ADMIN / PLATFORM_ADMIN；PLATFORM_ADMIN 只能建 SUB_ADMIN
  if (role === PlatformAdminRole.SUPER_ADMIN && auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '只有 Super Admin 可建立 Super Admin' }, { status: 403 })
  }
  if (role === PlatformAdminRole.PLATFORM_ADMIN && auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '只有 Super Admin 可建立 Platform Admin' }, { status: 403 })
  }
  if (role === PlatformAdminRole.PLATFORM_ADMIN && (!tenantSlug || !brandName || !liffId)) {
    return NextResponse.json({ error: 'Platform Admin 需填寫 tenantSlug、brandName、liffId' }, { status: 400 })
  }
  // Super Admin 建 Sub Admin 時必須指定所屬 Platform
  if (role === PlatformAdminRole.SUB_ADMIN && auth.role === PlatformAdminRole.SUPER_ADMIN && !bodyParentId) {
    return NextResponse.json({ error: 'Super Admin 建立 Sub Admin 需指定所屬 Platform' }, { status: 400 })
  }

  // parentId 決定：新建的 Super Admin 為頂層、無上層（不綁租戶）；Super Admin 建 Sub Admin
  // 時用前端指定的所屬 Platform；其餘（Platform Admin、Platform Admin 建 Sub Admin）掛在建立者底下。
  const parentId: string | undefined =
    role === PlatformAdminRole.SUPER_ADMIN
      ? undefined
      : (role === PlatformAdminRole.SUB_ADMIN && auth.role === PlatformAdminRole.SUPER_ADMIN)
        ? bodyParentId
        : auth.adminId

  try {
    const admin = await createAdmin({
      email, password, name, role,
      parentId,
      createdById: auth.adminId,
      modules: modules ?? [],
      tenantSlug, brandName, liffId, primaryColor,
    })
    return NextResponse.json({ admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '建立失敗，帳號可能已存在' }, { status: 422 })
  }
}
