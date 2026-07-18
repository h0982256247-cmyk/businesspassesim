import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'

// GET /api/platform/auth/me — 取得目前登入的管理員資訊
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const admin = await prisma.adminUser.findUnique({
    where: { id: auth.adminId },
    select: {
      id: true, name: true, email: true, role: true, groupId: true,
      group: { select: { id: true, name: true } },
    },
  })

  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ admin })
}
