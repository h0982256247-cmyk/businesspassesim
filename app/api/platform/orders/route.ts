import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { Prisma, OrderStatus } from '@prisma/client'
import { orderTenantWhere } from '@/lib/services/order'

// GET /api/platform/orders?page=1&status=PENDING（待付款涵蓋 PENDING+PROCESSING）
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const statusParam = req.nextUrl.searchParams.get('status')
  const pageSize = 20

  const tenantAdminId = auth.role === 'SUPER_ADMIN'
    ? (req.nextUrl.searchParams.get('tenantAdminId') || null)
    : auth.tenantAdminId
  const tenantWhere = orderTenantWhere(tenantAdminId)

  // 待付款 filter（status=PENDING）需同時涵蓋 PENDING（建立中）與 PROCESSING
  // （金流進行中／已送出尚未收到 backend notify）——兩者前台皆顯示「待付款」。
  const statusWhere: Prisma.OrderWhereInput =
    statusParam === OrderStatus.PENDING
      ? { status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] } }
      : statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)
        ? { status: statusParam as OrderStatus }
        : {}

  // 搜尋：訂單編號 或 會員暱稱（Email 已加密無法比對，故不納入）
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const searchWhere: Prisma.OrderWhereInput = q ? {
    OR: [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { user: { displayName: { contains: q, mode: 'insensitive' } } },
    ],
  } : {}

  const where: Prisma.OrderWhereInput = {
    ...statusWhere,
    ...tenantWhere,
    ...searchWhere,
  }

  // 同捆（多張 eSIM 一次結帳 = 共用 bundleId）在列表只佔一列：
  // 代表列 = 無 bundle 的單筆訂單，或 bundle 的第一張（bundleSeq=1，1-indexed）。
  const repWhere: Prisma.OrderWhereInput = {
    AND: [where, { OR: [{ bundleId: null }, { bundleSeq: 1 }] }],
  }

  const [reps, total] = await Promise.all([
    prisma.order.findMany({
      where: repWhere,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalPaid: true,
        subtotal: true,
        discountAmount: true,
        paymentMethod: true,
        tapPayOrderId: true,
        paidAt: true,
        createdAt: true,
        retryCount: true,
        bundleId: true,
        user: { select: { displayName: true, lineUid: true } },
        orderItems: { select: { productName: true } },
      },
    }),
    prisma.order.count({ where: repWhere }),
  ])

  // 同捆合計：張數與金額合計（不受 status filter 影響，呈現整捆全貌）
  const bundleIds = reps.map(r => r.bundleId).filter((b): b is string => !!b)
  const aggMap = new Map<string, { count: number; total: number }>()
  if (bundleIds.length > 0) {
    const aggs = await prisma.order.groupBy({
      by: ['bundleId'],
      where: { bundleId: { in: bundleIds } },
      _count: { _all: true },
      _sum: { totalPaid: true },
    })
    for (const a of aggs) if (a.bundleId) aggMap.set(a.bundleId, { count: a._count._all, total: a._sum.totalPaid ?? 0 })
  }

  const orders = reps.map(r => {
    const agg = r.bundleId ? aggMap.get(r.bundleId) : undefined
    return { ...r, esimCount: agg?.count ?? 1, bundleTotal: agg?.total ?? r.totalPaid }
  })

  return NextResponse.json({ orders, total, page, pageSize })
}
