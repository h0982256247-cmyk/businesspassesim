import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { Prisma, OrderStatus } from '@prisma/client'
import * as XLSX from 'xlsx'
import { safeDecrypt } from '@/lib/utils/crypto'
import { deriveEsimStatus } from '@/lib/esimStatus'
import { processingFee } from '@/lib/utils/payment-fee'
import { ORDER_STATUS_META } from '@/components/platform/OrderStatusBadge'

// GET /api/platform/orders/export —— 依「目前畫面篩選」匯出訂單 Excel（.xlsx）
// 篩選條件（status/q/from/to/companyId）與列表 API 完全一致，差別只是不分頁、全撈。
// 合購（多張 eSIM 一次結帳＝共用 bundleId）收合成「一筆結帳一列」；每張不同的欄位
// （世界移動訂單號 / eSIM 狀態 / 到期日）以「、」串接，確保對帳不遺漏。
// 資安：esimRcode/esimQrcode 僅供 deriveEsimStatus 推導「狀態文字」，一律不輸出原值；
//       其餘 QR/LPA/ICCID/PIN/PUK 根本不撈。Email/電話為加密欄位，輸出前 safeDecrypt。
export const dynamic = 'force-dynamic'

const TZ = 'Asia/Taipei'
const fmtDateTime = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).slice(0, 16) : ''
const fmtDate = (d: Date | null | undefined): string =>
  d ? new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : ''
const concat = (vals: (string | null | undefined)[]): string =>
  [...new Set(vals.filter((v): v is string => !!v))].join('、')

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  // ── 篩選：與 app/api/platform/orders/route.ts 同一套邏輯 ──
  const sp = req.nextUrl.searchParams
  const statusParam = sp.get('status')
  const statusWhere: Prisma.OrderWhereInput =
    statusParam === OrderStatus.PENDING
      ? { status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] } }
      : statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)
        ? { status: statusParam as OrderStatus }
        : {}
  const q = (sp.get('q') ?? '').trim()
  const searchWhere: Prisma.OrderWhereInput = q ? {
    OR: [
      { orderNumber: { contains: q, mode: 'insensitive' } },
      { wmOrderId: { contains: q, mode: 'insensitive' } },
      { wmOrderSn: { contains: q, mode: 'insensitive' } },
      { user: { displayName: { contains: q, mode: 'insensitive' } } },
    ],
  } : {}
  const parseDate = (s: string | null) => { if (!s) return undefined; const d = new Date(s); return isNaN(d.getTime()) ? undefined : d }
  const from = parseDate(sp.get('from'))
  const to = parseDate(sp.get('to'))
  const dateWhere: Prisma.OrderWhereInput = (from || to)
    ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
    : {}
  const companyIdParam = sp.get('companyId')
  const companyWhere: Prisma.OrderWhereInput = companyIdParam ? { companyId: companyIdParam } : {}
  const where: Prisma.OrderWhereInput = { ...statusWhere, ...searchWhere, ...dateWhere, ...companyWhere }

  // 撈符合條件的「每一張」eSIM（含 bundle 內每張），稍後在 JS 依 bundle 收合
  const cards = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, orderNumber: true, status: true,
      subtotal: true, totalPaid: true, taxAmount: true, refundedAmount: true,
      priceTier: true, paymentMethod: true, tapPayRecTradeId: true, wmOrderId: true,
      paidAt: true, createdAt: true, bundleId: true, bundleSeq: true,
      activationEnd: true, redeemedAt: true, activatedAt: true,
      esimRcode: true, esimQrcode: true, // 僅供 deriveEsimStatus 推導狀態，不輸出
      user: { select: { displayName: true, email: true, phone: true } },
      company: { select: { name: true } },
      orderItems: { select: { productName: true, qty: true, unitCost: true } },
      receipt: { select: { receiptNumber: true } },
    },
  })

  // 依 bundle 收合：無 bundleId 的每張自成一組
  const groups = new Map<string, typeof cards>()
  for (const c of cards) {
    const key = c.bundleId ?? `single:${c.id}`
    const arr = groups.get(key)
    if (arr) arr.push(c); else groups.set(key, [c])
  }

  const HEADER = [
    '訂單編號', '結帳批次', '建立時間', '付款時間', '狀態', '會員名稱', '會員Email', '會員電話',
    '會員身分', '價格別', '商品', '數量(張)', '小計(含稅)', '稅額', '實付金額', '已退金額',
    '成本', '毛利', '付款方式', '金流手續費', '金流交易號', '世界移動訂單號', 'eSIM狀態', '到期日', '收據編號',
  ]

  const rows: (string | number)[][] = []
  let paidGross = 0, paidCount = 0, refundTotal = 0, netRevenue = 0, totalCards = 0, feeTotal = 0

  for (const group of groups.values()) {
    const g = [...group].sort((a, b) => (a.bundleSeq ?? 1) - (b.bundleSeq ?? 1))
    const rep = g[0]                 // 代表列＝bundleSeq 最小（或單張）
    const n = g.length
    totalCards += n

    const subtotal = g.reduce((s, c) => s + c.subtotal, 0)
    const tax = g.reduce((s, c) => s + c.taxAmount, 0)
    const paid = g.reduce((s, c) => s + c.totalPaid, 0)
    const refunded = g.reduce((s, c) => s + c.refundedAmount, 0)
    const cost = g.reduce((s, c) => s + c.orderItems.reduce((t, it) => t + it.unitCost * it.qty, 0), 0)

    // 商品：同款顯示「名稱 ×N」，多款以「、」串
    const prodNames = g.flatMap(c => c.orderItems.map(it => it.productName))
    const uniqProd = [...new Set(prodNames)]
    const product = uniqProd.length === 1 ? (n > 1 ? `${uniqProd[0]} ×${n}` : uniqProd[0]) : uniqProd.join('、')

    const esimStatus = concat(g.map(c => deriveEsimStatus({
      status: c.status,
      esimRcode: c.esimRcode, esimQrcode: c.esimQrcode,
      redeemedAt: c.redeemedAt?.toISOString() ?? null,
      activatedAt: c.activatedAt?.toISOString() ?? null,
      activationEnd: c.activationEnd?.toISOString() ?? null,
    }).label))

    // 金流手續費：以本次結帳實付總額計（一次結帳＝一筆 TapPay 交易）；未付款回 null → 顯示空白。
    // 發卡國別尚未擷取，信用卡暫以國內 2.2% 計。
    const fee = processingFee({ paymentMethod: rep.paymentMethod, totalPaid: paid, paidAt: rep.paidAt })
    if (fee != null) feeTotal += fee

    // 摘要統計：已付款/完成計入實收；淨收入＝實付−已退（含已退款訂單沖銷後的實際留存）
    if (rep.status === OrderStatus.PAID || rep.status === OrderStatus.COMPLETED) { paidGross += paid; paidCount += 1 }
    refundTotal += refunded
    if (rep.status === OrderStatus.PAID || rep.status === OrderStatus.COMPLETED || rep.status === OrderStatus.REFUNDED) netRevenue += paid - refunded

    rows.push([
      rep.orderNumber ?? `#${rep.id.slice(-8).toUpperCase()}`,
      rep.bundleId ?? '',
      fmtDateTime(rep.createdAt),
      fmtDateTime(rep.paidAt),
      ORDER_STATUS_META[rep.status]?.label ?? rep.status,
      rep.user.displayName,
      rep.user.email ? safeDecrypt(rep.user.email) : '',
      rep.user.phone ? safeDecrypt(rep.user.phone) : '',
      rep.company?.name ?? '一般會員',
      rep.priceTier === 'BENEFIT' ? '福利價' : '一般價',
      product,
      n,
      subtotal, tax, paid, refunded, cost, paid - cost,
      rep.paymentMethod === 'CREDIT_CARD' ? '信用卡' : 'LINE Pay',
      fee ?? '',
      concat(g.map(c => c.tapPayRecTradeId)),
      concat(g.map(c => c.wmOrderId)),
      esimStatus,
      concat(g.map(c => fmtDate(c.activationEnd))),
      rep.receipt?.receiptNumber ?? '',
    ])
  }

  // ── 摘要區（表格頂端）＋ 表頭 + 明細，組成單一工作表 ──
  const statusLabel = statusParam ? (ORDER_STATUS_META[statusParam]?.label ?? statusParam) : '全部'
  const dateDesc = (from || to)
    ? `${from ? fmtDate(from) : '—'} ~ ${to ? fmtDate(new Date(to.getTime() - 1)) : '—'}`  // to 為排他上界，顯示 -1ms＝最後一天
    : '全部期間'
  const companyDesc = companyIdParam ? (cards[0]?.company?.name ?? '指定企業') : '全部企業'
  const now = new Date()

  const aoa: (string | number)[][] = [
    ['商務通 訂單報表'],
    [`匯出時間：${fmtDateTime(now)}（台北時間）`],
    [`篩選條件：狀態 ${statusLabel}｜日期 ${dateDesc}｜企業 ${companyDesc}`],
    [],
    ['結帳筆數', groups.size, '', '已付款/完成筆數', paidCount, '', '已付款金額(NT$)', paidGross],
    ['eSIM 張數', totalCards, '', '退款總額(NT$)', refundTotal, '', '淨收入(NT$)', netRevenue],
    ['金流手續費(NT$)', feeTotal],
    [],
    HEADER,
    ...rows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [18, 22, 17, 17, 11, 12, 24, 14, 14, 9, 24, 9, 12, 9, 12, 12, 10, 10, 10, 12, 22, 22, 16, 12, 18].map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '訂單報表')
  // NextResponse 的 body 不吃 Node Buffer，包成 Uint8Array（合法 BodyInit）
  const buf = new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)

  const stamp = fmtDate(now).replace(/-/g, '')
  const filename = `商務通訂單報表_${stamp}.xlsx`
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="orders_${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
