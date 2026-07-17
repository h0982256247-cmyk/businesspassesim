import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { PlatformAdminRole, OrderStatus } from '@prisma/client'
import { aggregateMargin } from '@/lib/services/finance-metrics'

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const monthParam = req.nextUrl.searchParams.get('month') // YYYY-MM, optional

  // Get all Platform Admins
  const platformAdmins = await prisma.platformAdmin.findMany({
    where: { role: PlatformAdminRole.PLATFORM_ADMIN, isActive: true },
    select: { id: true, name: true, brandName: true },
    orderBy: { createdAt: 'asc' },
  })

  // Build date range for month filter
  let dateFrom: Date | undefined
  let dateTo: Date | undefined
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split('-').map(Number)
    dateFrom = new Date(year, month - 1, 1)
    dateTo = new Date(year, month, 1)
  }

  // Global stats (no tenant filter)
  const globalOrderWhere = {
    status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] as OrderStatus[] },
    ...(dateFrom && dateTo ? { paidAt: { gte: dateFrom, lt: dateTo } } : {}),
  }

  const [globalRevenue, globalOrders, globalMargin] = await Promise.all([
    prisma.order.aggregate({ where: globalOrderWhere, _sum: { totalPaid: true } }),
    prisma.order.count({ where: globalOrderWhere }),
    aggregateMargin(globalOrderWhere),
  ])

  // Per-tenant stats
  const tenantStats = await Promise.all(
    platformAdmins.map(async (admin) => {
      const tenantOrderWhere = {
        status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] as OrderStatus[] },
        ...(dateFrom && dateTo ? { paidAt: { gte: dateFrom, lt: dateTo } } : {}),
        user: {
          OR: [
            { groupMembership: { group: { tenantAdminId: admin.id } } },
            { ownedGroup: { tenantAdminId: admin.id } },
          ],
        },
      }

      const [revenue, orders, groups, users, pendingCommissions, margin] = await Promise.all([
        prisma.order.aggregate({ where: tenantOrderWhere, _sum: { totalPaid: true } }),
        prisma.order.count({ where: tenantOrderWhere }),
        prisma.group.count({ where: { tenantAdminId: admin.id, status: 'APPROVED' } }),
        prisma.user.count({
          where: {
            OR: [
              { groupMembership: { group: { tenantAdminId: admin.id } } },
              { ownedGroup: { tenantAdminId: admin.id } },
            ],
          },
        }),
        prisma.commission.aggregate({
          where: { status: 'PENDING', group: { tenantAdminId: admin.id } },
          _sum: { commissionAmount: true },
        }),
        aggregateMargin(tenantOrderWhere),
      ])

      return {
        id: admin.id,
        name: admin.name,
        brandName: admin.brandName,
        revenue: revenue._sum.totalPaid ?? 0,
        orders,
        groups,
        users,
        pendingCommissions: pendingCommissions._sum.commissionAmount ?? 0,
        cost:            margin.cost,
        grossProfit:     margin.grossProfit,
        marginRate:      margin.marginRate,
        eligibleRevenue: margin.eligibleRevenue,
        ordersIncluded:  margin.ordersIncluded,
        ordersExcluded:  margin.ordersExcluded,
      }
    })
  )

  return NextResponse.json({
    month: monthParam ?? null,
    global: {
      revenue: globalRevenue._sum.totalPaid ?? 0,
      orders: globalOrders,
      cost:            globalMargin.cost,
      grossProfit:     globalMargin.grossProfit,
      marginRate:      globalMargin.marginRate,
      eligibleRevenue: globalMargin.eligibleRevenue,
      ordersIncluded:  globalMargin.ordersIncluded,
      ordersExcluded:  globalMargin.ordersExcluded,
    },
    tenants: tenantStats,
  })
}
