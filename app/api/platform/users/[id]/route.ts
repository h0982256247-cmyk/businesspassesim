import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { safeDecrypt } from '@/lib/utils/crypto'

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/users/:id — 會員詳情（基本資料、企業歸屬、訂單）
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  let user
  try {
    user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        lineUid: true,
        displayName: true,
        realName: true,
        avatarUrl: true,
        phone: true,
        email: true,
        birthday: true,
        createdAt: true,
        groupMembership: {
          select: { status: true, role: true, joinedAt: true, group: { select: { id: true, name: true } } },
        },
        orders: {
          select: {
            id: true,
            status: true,
            totalPaid: true,
            priceTier: true,
            createdAt: true,
            paidAt: true,
            bundleId: true,
            bundleSeq: true,
            orderItems: { select: { productName: true }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
          take: 40,
        },
      },
    })
  } catch (e) {
    console.error('User detail DB error:', e)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!user) return NextResponse.json({ error: '會員不存在' }, { status: 404 })

  // 同捆訂單（多張 eSIM 一次結帳）在訂單紀錄合併為一列：以最小 bundleSeq 為代表，
  // 附 esimCount 與整捆金額合計，與「訂單管理」列表一致。
  const seenBundles = new Set<string>()
  const orders = user.orders.flatMap(o => {
    if (!o.bundleId) return [{ ...o, esimCount: 1, bundleTotal: o.totalPaid }]
    if (seenBundles.has(o.bundleId)) return []
    seenBundles.add(o.bundleId)
    const group = user.orders.filter(x => x.bundleId === o.bundleId)
    const rep = group.reduce((a, b) => ((a.bundleSeq ?? 0) <= (b.bundleSeq ?? 0) ? a : b))
    return [{ ...rep, esimCount: group.length, bundleTotal: group.reduce((s, x) => s + x.totalPaid, 0) }]
  })

  return NextResponse.json({
    user: {
      ...user,
      orders,
      phone: user.phone ? safeDecrypt(user.phone) : user.phone,
      email: user.email ? safeDecrypt(user.email) : user.email,
    },
  })
}
