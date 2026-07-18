import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { toggleAdminActive, updateAdminPassword } from '@/lib/services/platform-admin'
import { AdminRole } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/admins/:id — 單一帳號（僅 SUPER_ADMIN）
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params
  const admin = await prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
      groupId: true, group: { select: { id: true, name: true } },
    },
  })

  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ admin })
}

// PATCH /api/platform/admins/:id — 停權切換 / 改密碼 / 重指派企業（僅 SUPER_ADMIN）
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  if (typeof body.isActive === 'boolean') {
    await toggleAdminActive(id, body.isActive)
    return NextResponse.json({ ok: true })
  }

  if (body.newPassword) {
    await updateAdminPassword(id, body.newPassword)
    return NextResponse.json({ ok: true })
  }

  // 重新指派企業管理員所屬企業
  if (body.groupId !== undefined) {
    await prisma.adminUser.update({ where: { id }, data: { groupId: body.groupId || null } })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效請求' }, { status: 400 })
}

// DELETE /api/platform/admins/:id — 移除帳號（僅 SUPER_ADMIN，不可刪自己或其他 SUPER_ADMIN）
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '只有 Super Admin 可移除帳號' }, { status: 403 })
  }

  const { id } = await params
  if (id === auth.adminId) {
    return NextResponse.json({ error: '不可刪除自己的帳號' }, { status: 400 })
  }

  const target = await prisma.adminUser.findUnique({ where: { id }, select: { role: true } })
  if (!target) return NextResponse.json({ error: '帳號不存在' }, { status: 404 })
  if (target.role === AdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '不可刪除 Super Admin 帳號' }, { status: 400 })
  }

  try {
    await prisma.adminUser.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
