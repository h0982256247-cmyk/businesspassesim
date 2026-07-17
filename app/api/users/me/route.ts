import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { safeDecrypt } from '@/lib/utils/crypto'

// GET /api/users/me — 回傳目前使用者的個人資料（用於檢查註冊完整性）
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, displayName: true, realName: true,
      phone: true, email: true, birthday: true, avatarUrl: true,
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  return NextResponse.json({
    user: {
      ...user,
      phone: user.phone ? safeDecrypt(user.phone) : user.phone,
      email: user.email ? safeDecrypt(user.email) : user.email,
      profileComplete: !!(user.phone && user.email),
    },
  })
}
