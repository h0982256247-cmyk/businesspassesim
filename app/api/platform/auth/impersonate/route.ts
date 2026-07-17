import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth, createPlatformSession, PLATFORM_COOKIE } from '@/lib/auth/platform'
import { PlatformAdminRole } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// POST /api/platform/auth/impersonate
// Body: { targetId: string }  — Super Admin 切換成某個 Platform Admin 的 session
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '只有 Super Admin 可切換後台' }, { status: 403 })
  }

  const { targetId } = await req.json()
  if (!targetId) return NextResponse.json({ error: '缺少 targetId' }, { status: 400 })

  const target = await prisma.platformAdmin.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, isActive: true },
  })

  if (!target) return NextResponse.json({ error: '帳號不存在' }, { status: 404 })
  if (target.role !== PlatformAdminRole.PLATFORM_ADMIN) {
    return NextResponse.json({ error: '目標帳號必須是 Platform Admin' }, { status: 400 })
  }
  if (!target.isActive) {
    return NextResponse.json({ error: '該帳號已停用' }, { status: 400 })
  }

  // 讀取目前 Super Admin 的名稱（儲存進 session 供 banner 顯示）
  const superAdmin = await prisma.platformAdmin.findUnique({
    where: { id: auth.adminId },
    select: { name: true },
  })

  const token = await createPlatformSession({
    adminId:         target.id,
    role:            target.role,
    tenantAdminId:   target.id,
    impersonatorId:  auth.adminId,
    impersonatorName: superAdmin?.name ?? 'Super Admin',
  })

  const res = NextResponse.json({ ok: true, name: target.name })
  res.cookies.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60,
    path: '/',
  })
  return res
}
