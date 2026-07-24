import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { toggleAdminActive, updateAdminPassword, validateAdminPassword } from '@/lib/services/platform-admin'
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
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
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
    const pwError = validateAdminPassword(body.newPassword)
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 })
    await updateAdminPassword(id, body.newPassword)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '無效請求' }, { status: 400 })
}
