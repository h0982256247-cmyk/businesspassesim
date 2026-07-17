import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth, createPlatformSession, PLATFORM_COOKIE } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'

// POST /api/platform/auth/impersonate-back
// 從 Platform Admin 切換回原本的 Super Admin session
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (!auth.impersonatorId) {
    return NextResponse.json({ error: '目前不在切換模式' }, { status: 400 })
  }

  const superAdmin = await prisma.platformAdmin.findUnique({
    where: { id: auth.impersonatorId },
    select: { id: true, role: true, isActive: true },
  })

  if (!superAdmin || !superAdmin.isActive) {
    return NextResponse.json({ error: '原 Super Admin 帳號無效' }, { status: 400 })
  }

  const token = await createPlatformSession({
    adminId:       superAdmin.id,
    role:          superAdmin.role,
    tenantAdminId: null,
    // 清除 impersonator 標記
    impersonatorId:   null,
    impersonatorName: null,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60,
    path: '/',
  })
  return res
}
