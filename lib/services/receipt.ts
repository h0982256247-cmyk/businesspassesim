import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus, type Prisma } from '@prisma/client'
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

// 台灣時區（UTC+8，無 DST）日期分段：收據日期與流水都以「購買日（台灣）」為準。
function taiwanYmd(d: Date): { y: number; m: number; day: number; seqDate: string } {
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, day = t.getUTCDate()
  return { y, m, day, seqDate: `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}` }
}

const hasContent = (s?: string | null) => !!(s && s.trim())

type ReceiptFields = { buyerName?: string | null; taxId?: string | null; buyerAddress?: string | null }

// 三欄正規化（去頭尾空白、空字串→null）。
function normFields(f: ReceiptFields) {
  return {
    buyerName: f.buyerName?.trim() || null,
    taxId: f.taxId?.trim() || null,
    buyerAddress: f.buyerAddress?.trim() || null,
  }
}

// 「我的」可開立收據訂單清單（付款已收；含轉贈後仍歸屬本人者），附既有收據資訊。
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
      receipt: { select: { id: true, receiptNumber: true, shareToken: true, fieldsLocked: true } },
    },
  })
}

// 取「已付款且屬於本人」的訂單（開立收據前的授權與資格檢查）。
async function findEligibleOrder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      OR: [{ currentOwnerId: userId }, { userId }],
      status: { in: RECEIPTABLE_STATUS },
      paidAt: { not: null },
    },
    select: { id: true, totalPaid: true, paidAt: true, createdAt: true, wmOrderId: true },
  })
  return order
}

// 開立或取回收據（一訂單一收據，冪等）。已存在則回傳既有；可同時帶入三欄（有值即鎖）。
export async function issueOrGetReceipt(userId: string, orderId: string, fields?: ReceiptFields) {
  const existing = await prisma.receipt.findUnique({ where: { orderId } })
  if (existing) {
    // 既有收據：若尚未鎖且這次有帶內容，順手補填並鎖定。
    if (!existing.fieldsLocked && fields) {
      const nf = normFields(fields)
      if (hasContent(nf.buyerName) || hasContent(nf.taxId) || hasContent(nf.buyerAddress)) {
        return prisma.receipt.update({ where: { id: existing.id }, data: { ...nf, fieldsLocked: true } })
      }
    }
    return existing
  }

  const order = await findEligibleOrder(userId, orderId)
  if (!order) return null

  const purchaseAt = order.paidAt ?? order.createdAt
  const { y, m, day, seqDate } = taiwanYmd(purchaseAt)

  // 原子遞增當日流水（同購買日一組，0001 起），並發不撞號。
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO receipt_counters (seq_date, count) VALUES (${seqDate}, 1)
    ON CONFLICT (seq_date) DO UPDATE SET count = receipt_counters.count + 1
    RETURNING count
  `
  const seq = Number(rows[0].count)

  const nf = normFields(fields ?? {})
  const locked = hasContent(nf.buyerName) || hasContent(nf.taxId) || hasContent(nf.buyerAddress)

  try {
    return await prisma.receipt.create({
      data: {
        receiptNumber: formatReceiptNumber(y, m, day, seq),
        orderId: order.id,
        issueDate: purchaseAt,
        seqDate,
        seq,
        itemName: RECEIPT_ITEM_NAME,
        qty: 1,
        amount: order.totalPaid,
        wmOrderId: order.wmOrderId,
        ...nf,
        fieldsLocked: locked,
        shareToken: randomBytes(16).toString('hex'),
      },
    })
  } catch (e) {
    // 併發下另一請求已為同訂單建立收據（orderId unique）→ 回傳既有那筆。
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
      const again = await prisma.receipt.findUnique({ where: { orderId } })
      if (again) return again
    }
    throw e
  }
}

// 取回本人某訂單的收據（owner-scoped）。
export async function getReceiptForUser(userId: string, receiptId: string) {
  return prisma.receipt.findFirst({
    where: { id: receiptId, order: { OR: [{ currentOwnerId: userId }, { userId }] } },
  })
}

// 補填三欄（僅未鎖定時允許；填入有值即鎖）。回傳 'locked' / 'notfound' / 更新後收據。
export async function updateReceiptFields(userId: string, receiptId: string, fields: ReceiptFields) {
  const r = await getReceiptForUser(userId, receiptId)
  if (!r) return 'notfound' as const
  if (r.fieldsLocked) return 'locked' as const
  const nf = normFields(fields)
  const locked = hasContent(nf.buyerName) || hasContent(nf.taxId) || hasContent(nf.buyerAddress)
  return prisma.receipt.update({ where: { id: r.id }, data: { ...nf, fieldsLocked: locked } })
}

// 公開分享頁用：以 shareToken 取收據（免登入；token 不可猜）。回 null＝查無。
export async function getReceiptByShareToken(token: string) {
  if (!token) return null
  return prisma.receipt.findUnique({ where: { shareToken: token } })
}
