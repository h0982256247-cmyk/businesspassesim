import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { Prisma, OrderStatus } from '@prisma/client'

// GET /api/platform/orders?page=1&status=PENDING（待付款涵蓋 PENDING+PROCESSING）
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const statusParam = req.nextUrl.searchParams.get('status')
  const pageSize = 20

  // 待付款 filter（status=PENDING）需同時涵蓋 PENDING（建立中）與 PROCESSING（金流進行中）。
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

  // 時間區間（createdAt）；from/to 為 ISO 瞬間字串（前端依當地時區換算後送，to 為排他上界）
  const parseDate = (s: string | null) => { if (!s) return undefined; const d = new Date(s); return isNaN(d.getTime()) ? undefined : d }
  const from = parseDate(req.nextUrl.searchParams.get('from'))
  const to = parseDate(req.nextUrl.searchParams.get('to'))
  const dateWhere: Prisma.OrderWhereInput = (from || to)
    ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
    : {}

  // 企業篩選（下拉選特定企業；空＝全部企業）
  const companyId = req.nextUrl.searchParams.get('companyId')
  const companyWhere: Prisma.OrderWhereInput = companyId ? { companyId } : {}

  const where: Prisma.OrderWhereInput = { ...statusWhere, ...searchWhere, ...dateWhere, ...companyWhere }

  // 同捆（多張 eSIM 一次結帳 = 共用 bundleId）在列表只佔一列：
  // 代表列 = 無 bundle 的單筆訂單，或 bundle 的第一張（bundleSeq=1）。
  const repWhere: Prisma.OrderWhereInput = {
    AND: [where, { OR: [{ bundleId: null }, { bundleSeq: 1 }] }],
  }

  // 區間結算總額：此時間區間 + 搜尋條件下、已付款（PAID/COMPLETED）訂單的實付金額加總。
  // 不受上方狀態分頁影響，反映「這段期間實際收了多少」；含 bundle 內每一張 eSIM。
  const settlementWhere: Prisma.OrderWhereInput = {
    ...searchWhere, ...dateWhere, ...companyWhere,
    status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] },
  }

  const [reps, total, settle] = await Promise.all([
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
        priceTier: true,
        paymentMethod: true,
        tapPayOrderId: true,
        paidAt: true,
        createdAt: true,
        retryCount: true,
        bundleId: true,
        user: { select: { displayName: true, lineUid: true } },
        company: { select: { name: true } },
        orderItems: { select: { productName: true } },
      },
    }),
    prisma.order.count({ where: repWhere }),
    prisma.order.aggregate({ where: settlementWhere, _sum: { totalPaid: true }, _count: { _all: true } }),
  ])

  // 同捆合計：張數與金額（不受 status filter 影響，呈現整捆全貌）
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

  return NextResponse.json({
    orders, total, page, pageSize,
    rangeTotal: settle._sum.totalPaid ?? 0,   // 區間結算總額（已付款實付加總）
    rangeCount: settle._count._all,           // 區間已付款訂單數
  })
}
