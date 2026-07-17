import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminCredentials } from '@/lib/services/platform-admin'
import { createPlatformSession, PLATFORM_COOKIE } from '@/lib/auth/platform'

// POST /api/platform/auth/login
export async function POST(req: NextRequest) {
  const { email, password, rememberMe } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: '帳號與密碼必填' }, { status: 400 })
  }

  let admin
  try {
    admin = await verifyAdminCredentials(email, password)
  } catch {
    return NextResponse.json({ error: '伺服器錯誤，請稍後再試' }, { status: 500 })
  }
  if (!admin) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
  }

  let tenantAdminId: string | null = null
  if (admin.role === 'PLATFORM_ADMIN') tenantAdminId = admin.id
  else if (admin.role === 'SUB_ADMIN') tenantAdminId = admin.parentId ?? null

  const token = await createPlatformSession({
    adminId: admin.id,
    role: admin.role,
    tenantAdminId,
  })

  const res = NextResponse.json({
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, tenantAdminId },
  })

  res.cookies.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60,  // 30天 或 8小時
    path: '/',
  })

  return res
}
