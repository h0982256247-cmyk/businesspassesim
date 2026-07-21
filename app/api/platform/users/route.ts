import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { safeDecrypt } from '@/lib/utils/crypto'

// GET /api/platform/users?page=1&q=keyword
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const companyId = req.nextUrl.searchParams.get('companyId')
  const pageSize = 20

  const qWhere: Prisma.UserWhereInput = q
    ? {
        OR: [
          { displayName: { contains: q, mode: 'insensitive' as const } },
          { lineUid: { contains: q } },
        ],
      }
    : {}
  // 企業篩選：該企業「未離開」的成員（含待審／已核准）
  const companyWhere: Prisma.UserWhereInput = companyId
    ? { groupMembership: { groupId: companyId, leftAt: null } }
    : {}
  const where: Prisma.UserWhereInput = { ...qWhere, ...companyWhere }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        lineUid: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        email: true,
        createdAt: true,
        groupMembership: { select: { status: true, role: true, group: { select: { name: true } } } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  const usersDecrypted = users.map(u => ({
    ...u,
    phone: u.phone ? safeDecrypt(u.phone) : u.phone,
    email: u.email ? safeDecrypt(u.email) : u.email,
  }))

  return NextResponse.json({ users: usersDecrypted, total, page, pageSize })
}
