import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { MemberStatus, OrderStatus } from '@prisma/client'

// GET /api/platform/notifications — 頂欄通知鈴：待辦佇列計數（唯讀）
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  // 企業管理員只看自己企業的待審成員；Super Admin 看全部
  const groupScope = auth.role === 'COMPANY_ADMIN' && auth.groupId ? { groupId: auth.groupId } : {}

  const [pendingMembers, paidOrders] = await Promise.all([
    prisma.groupMember.count({ where: { status: MemberStatus.PENDING, leftAt: null, ...groupScope } }),
    prisma.order.count({ where: { status: OrderStatus.PAID } }),
  ])

  const items = [
    { key: 'orders',  label: '付款成功・待發卡', count: paidOrders,     href: '/platform/orders?status=PAID' },
    { key: 'members', label: '待審核成員',       count: pendingMembers, href: '/platform/groups' },
  ]

  return NextResponse.json({ items, total: items.reduce((s, i) => s + i.count, 0) })
}
