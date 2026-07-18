import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db/prisma'
import { Prisma, AdminRole, MemberStatus } from '@prisma/client'

// ─── 登入驗證 ─────────────────────────────────────────────────────

export async function verifyAdminCredentials(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, name: true, role: true, isActive: true, groupId: true },
  })

  if (!admin || !admin.isActive) return null

  const valid = await bcrypt.compare(password, admin.passwordHash)
  if (!valid) return null

  return { id: admin.id, email: admin.email, name: admin.name, role: admin.role, groupId: admin.groupId }
}

// ─── 建立帳號（Super Admin 建 Super Admin / 企業管理員）──────────────

export interface CreateAdminInput {
  email: string
  password: string
  name: string
  role: AdminRole
  groupId?: string | null   // COMPANY_ADMIN 綁定的企業
  createdById?: string
}

export async function createAdmin(input: CreateAdminInput) {
  const passwordHash = await bcrypt.hash(input.password, 12)
  return prisma.adminUser.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role,
      groupId: input.role === AdminRole.COMPANY_ADMIN ? (input.groupId ?? null) : null,
      createdById: input.createdById,
    },
  })
}

export async function updateAdminPassword(adminId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 12)
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash },
  })
}

export async function toggleAdminActive(adminId: string, isActive: boolean) {
  return prisma.adminUser.update({
    where: { id: adminId },
    data: { isActive },
  })
}

export async function getAllAdmins() {
  return prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, createdAt: true, groupId: true,
      group: { select: { name: true } },
    },
  })
}

// ─── Dashboard 統計 ───────────────────────────────────────────────

// 毛利定義 = (售價 − 成本) / 售價。低於 40% → 成本 > 售價 × 0.6 即示警。
const LOW_MARGIN_THRESHOLD = 0.40

// system_alerts.label → 後台可讀標題
const ALERT_LABEL: Record<string, string> = {
  esim_activation_failed:        '開卡失敗',
  triggerEsimActivation:         '開卡失敗',
  wm_order_failed:               '世界移動下單失敗',
  wm_order_exception:            '世界移動連線異常',
  wm_order_no_wmproductid:       '商品缺世界移動編號',
  wm_order_no_item:              '訂單缺品項',
  esim_activation_exhausted:     '開卡多次重試仍失敗（需人工）',
  esim_retry_exception:          '開卡自動重試異常',
  payment_verify_failed:         '金流驗真失敗',
  notifyOrderPaid:               '付款通知失敗',
}

// 平台毛利彙總（單一品牌，取代已移除的 finance-metrics）：只納入「所有品項皆有成本快照」
// 的已付款訂單，避免舊資料汙染。commission 已移除，毛利 = 營收 − 成本。
async function aggregateMargin(where: Prisma.OrderWhereInput) {
  const orders = await prisma.order.findMany({
    where,
    select: { totalPaid: true, orderItems: { select: { unitCost: true, qty: true } } },
  })
  let eligibleRevenue = 0, cost = 0, ordersIncluded = 0, ordersExcluded = 0
  for (const o of orders) {
    if (o.orderItems.length === 0) { ordersExcluded++; continue }
    ordersIncluded++
    eligibleRevenue += o.totalPaid
    cost += o.orderItems.reduce((s, i) => s + i.unitCost * i.qty, 0)
  }
  const grossProfit = eligibleRevenue - cost
  const marginRate = eligibleRevenue > 0 ? grossProfit / eligibleRevenue : 0
  return { eligibleRevenue, cost, grossProfit, marginRate, ordersIncluded, ordersExcluded }
}

// ─── 風險警示：虧損訂單 + 低毛利商品 + 系統異常（儀表板紅色警示區）────────
export async function getRiskAlerts() {
  const costFactor = 1 - LOW_MARGIN_THRESHOLD  // 成本 / 售價 的上限（0.6）

  const [lossRows, lossCount, lowMarginExamples, lowMarginCount, alertRows, alertCount] = await Promise.all([
    // 虧損訂單：已付款、所有品項皆有成本快照，且實付 < 成本。取虧最多的前 8 筆。
    prisma.$queryRaw<Array<{ id: string; orderNumber: string | null; totalPaid: number; cost: number }>>`
      SELECT o.id, o.order_number AS "orderNumber", o.total_paid AS "totalPaid",
             SUM(oi.unit_cost * oi.qty)::int AS cost
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status IN ('PAID','COMPLETED')
      GROUP BY o.id, o.order_number, o.total_paid
      HAVING o.total_paid < SUM(oi.unit_cost * oi.qty)
      ORDER BY (SUM(oi.unit_cost * oi.qty) - o.total_paid) DESC
      LIMIT 8`,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT o.id
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status IN ('PAID','COMPLETED')
        GROUP BY o.id, o.total_paid
        HAVING o.total_paid < SUM(oi.unit_cost * oi.qty)
      ) s`,
    prisma.$queryRaw<Array<{ id: string; countryNameZh: string; dataCapacity: string | null; displayDays: number; sellPrice: number; costPrice: number }>>`
      SELECT id, country_name_zh AS "countryNameZh", data_capacity AS "dataCapacity",
             display_days AS "displayDays", sell_price AS "sellPrice", cost_price AS "costPrice"
      FROM products
      WHERE status = 'ACTIVE' AND sell_price > 0 AND cost_price > sell_price * ${costFactor}::numeric
      ORDER BY (cost_price::float / sell_price) DESC
      LIMIT 8`,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM products
      WHERE status = 'ACTIVE' AND sell_price > 0 AND cost_price > sell_price * ${costFactor}::numeric`,
    // 系統異常（近 24h 未處理）：開卡/金流驗真/WM 等失敗
    prisma.$queryRaw<Array<{ label: string; orderId: string | null; createdAt: Date }>>`
      SELECT label, order_id AS "orderId", created_at AS "createdAt"
      FROM system_alerts
      WHERE resolved_at IS NULL AND created_at > now() - interval '24 hours'
      ORDER BY created_at DESC LIMIT 8`,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM system_alerts
      WHERE resolved_at IS NULL AND created_at > now() - interval '24 hours'`,
  ])

  return {
    threshold: LOW_MARGIN_THRESHOLD,
    systemAlerts: {
      count: alertCount[0]?.n ?? 0,
      examples: alertRows.map(a => ({
        title: ALERT_LABEL[a.label] ?? a.label,
        orderNo: a.orderId ? a.orderId.slice(-8).toUpperCase() : '—',
        at: a.createdAt.toISOString(),
      })),
    },
    lossOrders: {
      count: lossCount[0]?.n ?? 0,
      examples: lossRows.map(r => ({
        id: r.id,
        orderNo: r.orderNumber ?? r.id.slice(-8).toUpperCase(),
        totalPaid: r.totalPaid,
        cost: r.cost,
        loss: r.cost - r.totalPaid,
      })),
    },
    lowMarginProducts: {
      count: lowMarginCount[0]?.n ?? 0,
      examples: lowMarginExamples.map(p => ({
        id: p.id,
        name: `${p.countryNameZh} ${p.displayDays}天${p.dataCapacity ? ` · ${p.dataCapacity}` : ''}`,
        sellPrice: p.sellPrice,
        costPrice: p.costPrice,
        marginRate: p.sellPrice > 0 ? (p.sellPrice - p.costPrice) / p.sellPrice : 0,
      })),
    },
  }
}

export async function getDashboardStats() {
  const paidOrderWhere: Prisma.OrderWhereInput = { status: { in: ['PAID', 'COMPLETED'] } }

  const [
    totalUsers,
    totalOrders,
    paidOrders,
    pendingMembers,
    totalCompanies,
    totalProducts,
    esimPendingOrders,
    margin,
    riskAlerts,
    paymentConfigCount,
  ] = await Promise.all([
    prisma.user.count(),
    // 訂單總數以「購買」計：同捆（共用 bundleId）算 1 筆 → 只數代表列（單筆 或 bundle 第一張）。
    prisma.order.count({ where: { OR: [{ bundleId: null }, { bundleSeq: 1 }] } }),
    prisma.order.aggregate({ where: paidOrderWhere, _sum: { totalPaid: true } }),
    prisma.groupMember.count({ where: { status: MemberStatus.PENDING, leftAt: null } }),
    prisma.group.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    // 「付款成功但尚未發卡」：PAID 即已付款但尚未轉 COMPLETED（發卡）的訂單。
    prisma.order.count({ where: { status: 'PAID' } }),
    aggregateMargin(paidOrderWhere),
    getRiskAlerts(),
    prisma.paymentConfig.count({ where: { isActive: true } }),
  ])

  // Recent 6 months: revenue + grossProfit
  const now = new Date()
  const monthlyRevenue: { month: string; revenue: number; grossProfit: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextD = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const monthOrderWhere: Prisma.OrderWhereInput = {
      ...paidOrderWhere,
      createdAt: { gte: d, lt: nextD },
    }
    const [agg, m] = await Promise.all([
      prisma.order.aggregate({ where: monthOrderWhere, _sum: { totalPaid: true } }),
      aggregateMargin(monthOrderWhere),
    ])
    monthlyRevenue.push({
      month: `${d.getMonth() + 1}月`,
      revenue: agg._sum.totalPaid ?? 0,
      grossProfit: m.grossProfit,
    })
  }

  // Recent 5 orders — 同捆合併為一列：代表列 = 單筆 或 bundle 第一張(seq=1)
  const recentReps = await prisma.order.findMany({
    where: { OR: [{ bundleId: null }, { bundleSeq: 1 }] },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      orderNumber: true,
      totalPaid: true,
      status: true,
      createdAt: true,
      bundleId: true,
      user: { select: { displayName: true } },
      orderItems: { take: 1, select: { productName: true } },
    },
  })
  const recentBundleIds = recentReps.map(o => o.bundleId).filter((b): b is string => !!b)
  const recentAgg = new Map<string, { count: number; total: number }>()
  if (recentBundleIds.length > 0) {
    const aggs = await prisma.order.groupBy({
      by: ['bundleId'],
      where: { bundleId: { in: recentBundleIds } },
      _count: { _all: true },
      _sum: { totalPaid: true },
    })
    for (const a of aggs) if (a.bundleId) recentAgg.set(a.bundleId, { count: a._count._all, total: a._sum.totalPaid ?? 0 })
  }

  return {
    totalUsers,
    totalOrders,
    totalRevenue: paidOrders._sum.totalPaid ?? 0,
    pendingMembers,
    totalCompanies,
    totalProducts,
    paymentConfigured: paymentConfigCount > 0,
    esimPendingOrders,
    monthlyRevenue,
    // 平台實際毛利
    eligibleRevenue: margin.eligibleRevenue,
    totalCost:       margin.cost,
    grossProfit:     margin.grossProfit,
    marginRate:      margin.marginRate,
    ordersIncluded:  margin.ordersIncluded,
    ordersExcluded:  margin.ordersExcluded,
    riskAlerts,
    recentOrders: recentReps.map(o => {
      const agg = o.bundleId ? recentAgg.get(o.bundleId) : undefined
      return {
        id: o.id,
        orderNo: o.orderNumber ?? o.id.slice(-8).toUpperCase(),
        totalPaid: agg?.total ?? o.totalPaid,
        esimCount: agg?.count ?? 1,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        userName: o.user?.displayName ?? '—',
        productName: o.orderItems[0]?.productName ?? '—',
      }
    }),
  }
}
