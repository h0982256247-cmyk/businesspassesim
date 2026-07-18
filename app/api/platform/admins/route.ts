import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllAdmins, createAdmin } from '@/lib/services/platform-admin'
import { AdminRole } from '@prisma/client'

// GET /api/platform/admins — 帳號列表（僅 SUPER_ADMIN）
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const admins = await getAllAdmins()
  return NextResponse.json({ admins })
}

// POST /api/platform/admins — 建立帳號（僅 SUPER_ADMIN）
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { email, password, name } = await req.json()

  if (!email || !password || !name) {
    return NextResponse.json({ error: '必填欄位缺漏' }, { status: 400 })
  }

  try {
    const admin = await createAdmin({ email, password, name, createdById: auth.adminId })
    return NextResponse.json({ admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '建立失敗，帳號可能已存在' }, { status: 422 })
  }
}
