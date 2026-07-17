import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { GroupStatus, OrderStatus, WithdrawalStatus } from '@prisma/client'
import { orderTenantWhere } from '@/lib/services/order'

// GET /api/platform/notifications — 頂欄通知鈴：待辦/待處理佇列的計數（唯讀、tenant-scoped）
// SUPER_ADMIN 看全平台；其餘角色一律鎖自己租戶。皆為輕量 count，不動既有計算邏輯。
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const tid = auth.role === 'SUPER_ADMIN' ? null : auth.tenantAdminId

  const [pendingGroups, paidOrders, pendingWithdrawals] = await Promise.all([
    prisma.group.count({ where: { status: GroupStatus.PENDING, ...(tid ? { tenantAdminId: tid } : {}) } }),
    prisma.order.count({ where: { status: OrderStatus.PAID, ...orderTenantWhere(tid) } }),
    prisma.withdrawal.count({ where: { status: WithdrawalStatus.PENDING, ...(tid ? { group: { tenantAdminId: tid } } : {}) } }),
  ])

  const items = [
    { key: 'orders',      label: '付款成功・待發卡', count: paidOrders,         href: '/platform/orders?status=PAID' },
    { key: 'withdrawals', label: '提領待審核',       count: pendingWithdrawals, href: '/platform/withdrawals' },
    { key: 'groups',      label: '待審社群申請',     count: pendingGroups,      href: '/platform/groups?status=PENDING' },
  ]

  return NextResponse.json({ items, total: items.reduce((s, i) => s + i.count, 0) })
}
