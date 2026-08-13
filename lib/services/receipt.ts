import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus, type Prisma, type Receipt } from '@prisma/client'
import { formatReceiptNumber } from '@/lib/utils/receipt'

// 收據賣方資訊（固定；沿用店章 public/receipt/seal.png）。
export const RECEIPT_SELLER = {
  name: '伊新通有限公司',
  taxId: '00072529',
  phone: '0917-675-387',
  address: '新北市中和區宜安路4號2樓',
} as const

// 固定品名（依收據附圖）。
const RECEIPT_ITEM_NAME = '出國上網設備及通信費'

// 可開立收據的訂單狀態＝款項確實已收（排除待付款/處理中/失敗/取消/退款）。
const RECEIPTABLE_STATUS: OrderStatus[] = [OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.ESIM_PENDING]

export type ReceiptType = 'personal' | 'company'
export interface IssueOptions {
  type: ReceiptType
  companyTitlePersonal?: boolean // 公司收據時，抬頭用個人姓名（true）或企業名稱（false，預設）
}
export type IssueResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; error: 'NOT_FOUND' | 'NOT_COMPANY_ORDER' | 'COMPANY_INFO_MISSING' | 'NO_NAME' }

// 台灣時區（UTC+8，無 DST）日期分段：收據日期與流水都以「購買日（台灣）」為準。
function taiwanYmd(d: Date): { y: number; m: number; day: number; seqDate: string } {
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, day = t.getUTCDate()
  return { y, m, day, seqDate: `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}` }
}

// 「我的」可開立收據訂單清單（付款已收；含轉贈後仍歸屬本人者）。
// 附「下單當時企業」（company）與既有收據，讓前端判斷可否開公司收據＋抬頭預設。
export async function listReceiptableOrders(userId: string) {
  return prisma.order.findMany({
    where: {
      OR: [{ currentOwnerId: userId }, { userId }],
      status: { in: RECEIPTABLE_STATUS },
      paidAt: { not: null },
    },
    orderBy: { paidAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      totalPaid: true,
      paidAt: true,
      wmOrderId: true,
      orderItems: { select: { productName: true, qty: true }, take: 1 },
      company: { select: { id: true, name: true, taxId: true } }, // 下單當時所屬企業（null＝一般會員）
      receipt: { select: { id: true, receiptNumber: true, shareToken: true, type: true } },
    },
  })
}

// 取「已付款且屬於本人」的訂單（開立收據前的授權與資格檢查）；帶當時企業資料。
async function findEligibleOrder(userId: string, orderId: string) {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [{ currentOwnerId: userId }, { userId }],
      status: { in: RECEIPTABLE_STATUS },
      paidAt: { not: null },
    },
    select: {
      id: true, totalPaid: true, paidAt: true, createdAt: true, wmOrderId: true,
      company: { select: { name: true, taxId: true, address: true } },
    },
  })
}

// 開立或取回收據（一訂單一收據，開立後鎖定）。已存在→直接回既有（不可改類型）。
// 公司收據的統編/地址取自「下單當時企業」；抬頭依 companyTitlePersonal 決定（預設企業名）。
export async function issueOrGetReceipt(userId: string, orderId: string, opts: IssueOptions): Promise<IssueResult> {
  const existing = await prisma.receipt.findUnique({ where: { orderId } })
  if (existing) return { ok: true, receipt: existing }

  const order = await findEligibleOrder(userId, orderId)
  if (!order) return { ok: false, error: 'NOT_FOUND' }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { realName: true, displayName: true } })
  const personName = user?.realName?.trim() || user?.displayName?.trim() || ''

  let buyerName: string | null
  let taxId: string | null = null
  let buyerAddress: string | null = null

  if (opts.type === 'company') {
    if (!order.company) return { ok: false, error: 'NOT_COMPANY_ORDER' }
    if (!order.company.taxId) return { ok: false, error: 'COMPANY_INFO_MISSING' }
    taxId = order.company.taxId
    buyerAddress = order.company.address ?? null
    buyerName = opts.companyTitlePersonal ? (personName || order.company.name) : order.company.name
  } else {
    if (!personName) return { ok: false, error: 'NO_NAME' } // 個人收據需有姓名（未填基本資料）
    buyerName = personName
  }

  const purchaseAt = order.paidAt ?? order.createdAt
  const { y, m, day, seqDate } = taiwanYmd(purchaseAt)
  const seq = await nextSeq(seqDate)

  try {
    const receipt = await prisma.receipt.create({
      data: {
        receiptNumber: formatReceiptNumber(y, m, day, seq),
        orderId: order.id,
        issueDate: purchaseAt,
        seqDate,
        seq,
        type: opts.type,
        itemName: RECEIPT_ITEM_NAME,
        qty: 1,
        amount: order.totalPaid,
        wmOrderId: order.wmOrderId,
        buyerName,
        taxId,
        buyerAddress,
        fieldsLocked: true, // 開立即鎖（一訂單一收據、不可改類型）
        shareToken: randomBytes(16).toString('hex'),
      },
    })
    return { ok: true, receipt }
  } catch (e) {
    // 併發下另一請求已為同訂單建立收據（orderId unique）→ 回傳既有那筆。
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
      const again = await prisma.receipt.findUnique({ where: { orderId } })
      if (again) return { ok: true, receipt: again }
    }
    throw e
  }
}

// 取回本人某收據（owner-scoped）。
export async function getReceiptForUser(userId: string, receiptId: string) {
  return prisma.receipt.findFirst({
    where: { id: receiptId, order: { OR: [{ currentOwnerId: userId }, { userId }] } },
  })
}

// 公開分享頁用：以 shareToken 取收據（免登入；token 不可猜）。回 null＝查無。
export async function getReceiptByShareToken(token: string) {
  if (!token) return null
  return prisma.receipt.findUnique({ where: { shareToken: token } })
}

// 每日流水原子遞增（key = 購買日 seqDate）。upsert + RETURNING 保證併發不撞號。
async function nextSeq(seqDate: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO receipt_counters (seq_date, count) VALUES (${seqDate}, 1)
    ON CONFLICT (seq_date) DO UPDATE SET count = receipt_counters.count + 1
    RETURNING count
  `
  return Number(rows[0].count)
}
