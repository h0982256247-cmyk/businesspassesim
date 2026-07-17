import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { PlatformAdminRole, OrderStatus, CommissionStatus, GroupStatus } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id: tenantAdminId } = await params

  try {
    const [
      totalUsers,
      totalOrders,
      paidOrders,
      pendingGroups,
      approvedGroups,
      pendingCommissions,
      esimPendingOrders,
    ] = await Promise.all([
      prisma.user.count({ where: { tenantAdminId } }),
      prisma.order.count({ where: { user: { tenantAdminId } } }),
      prisma.order.aggregate({
        where: { user: { tenantAdminId }, status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] } },
        _sum: { totalPaid: true },
      }),
      prisma.group.count({ where: { status: GroupStatus.PENDING, tenantAdminId } }),
      prisma.group.count({ where: { status: GroupStatus.APPROVED, tenantAdminId } }),
      prisma.commission.aggregate({
        where: { status: CommissionStatus.PENDING, group: { tenantAdminId } },
        _sum: { commissionAmount: true },
      }),
      // 付款成功但尚未發卡：PAID = 已付款、尚未轉 COMPLETED（發卡）
      prisma.order.count({ where: { user: { tenantAdminId }, status: OrderStatus.PAID } }),
    ])

    return NextResponse.json({
      totalUsers,
      totalOrders,
      totalRevenue: paidOrders._sum.totalPaid ?? 0,
      pendingGroups,
      approvedGroups,
      pendingCommissions: pendingCommissions._sum.commissionAmount ?? 0,
      esimPendingOrders,
    })
  } catch (e) {
    console.error('Admin stats DB error:', e)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
}
