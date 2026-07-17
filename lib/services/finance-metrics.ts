import { prisma } from '@/lib/db/prisma'
import { CommissionStatus, Prisma } from '@prisma/client'

/**
 * 對指定範圍的訂單算毛利。
 * 只納入「每個 line item 都有 unitCost」的訂單（unitCost 是 OrderItem 的成本快照欄位）。
 *
 *   毛利     = eligibleRevenue − cost − commission
 *   毛利率   = 毛利 / eligibleRevenue
 *
 * eligibleRevenue 與 cost 都只計入 unitCost-完整 的訂單，分子分母同源，毛利率才精確。
 * commission 用 PENDING + SETTLED；CANCELLED 視為退款，不計入支出。
 */
export interface MarginResult {
  eligibleRevenue: number  // 納入毛利的訂單總營收
  cost:            number  // 供應商成本
  commission:      number  // 付給社群主的分潤（已產生，不含取消）
  grossProfit:     number  // 平台實際毛利
  marginRate:      number  // 毛利率 [0, 1]
  ordersIncluded:  number
  ordersExcluded:  number
}

export async function aggregateMargin(orderWhere: Prisma.OrderWhereInput): Promise<MarginResult> {
  const eligibleWhere: Prisma.OrderWhereInput = {
    ...orderWhere,
    orderItems: { every: { unitCost: { not: null } } },
  }

  const [revenueAgg, items, commissionAgg, ordersIncluded, ordersTotal] = await Promise.all([
    prisma.order.aggregate({ where: eligibleWhere, _sum: { totalPaid: true } }),
    prisma.orderItem.findMany({
      where: { order: eligibleWhere },
      select: { unitCost: true, qty: true },
    }),
    prisma.commission.aggregate({
      where: {
        order: eligibleWhere,
        status: { in: [CommissionStatus.PENDING, CommissionStatus.SETTLED] },
      },
      _sum: { commissionAmount: true },
    }),
    prisma.order.count({ where: eligibleWhere }),
    prisma.order.count({ where: orderWhere }),
  ])

  const eligibleRevenue = revenueAgg._sum.totalPaid ?? 0
  const cost            = items.reduce((s, i) => s + (i.unitCost ?? 0) * i.qty, 0)
  const commission      = commissionAgg._sum.commissionAmount ?? 0
  const grossProfit     = eligibleRevenue - cost - commission
  const marginRate      = eligibleRevenue > 0 ? grossProfit / eligibleRevenue : 0

  return {
    eligibleRevenue,
    cost,
    commission,
    grossProfit,
    marginRate,
    ordersIncluded,
    ordersExcluded: ordersTotal - ordersIncluded,
  }
}
