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
export type FillResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; error: 'NOT_FOUND' | 'LOCKED' | 'NOT_COMPANY_ORDER' | 'COMPANY_INFO_MISSING' }

function taiwanYmd(d: Date): { y: number; m: number; day: number; seqDate: string } {
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, day = t.getUTCDate()
  return { y, m, day, seqDate: `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}` }
}

// 付款完成即自動產生「空白買受人」收據（idempotent）。付款流程呼叫；失敗不可影響付款。
// 回傳收據；訂單不存在/未收款則回 null。
export async function ensureReceiptForOrder(orderId: string): Promise<Receipt | null> {
  const existing = await prisma.receipt.findUnique({ where: { orderId } })
  if (existing) return existing

  const order = await prisma.order.findFirst({
    where: { id: orderId, status: { in: RECEIPTABLE_STATUS }, paidAt: { not: null } },
    select: { id: true, totalPaid: true, paidAt: true, createdAt: true, wmOrderId: true },
  })
  if (!order) return null

  const purchaseAt = order.paidAt ?? order.createdAt
  const { y, m, day, seqDate } = taiwanYmd(purchaseAt)
  const seq = await nextSeq(seqDate)

  try {
    return await prisma.receipt.create({
      data: {
        receiptNumber: formatReceiptNumber(y, m, day, seq),
        orderId: order.id,
        issueDate: purchaseAt,
        seqDate,
        seq,
        type: 'personal',
        itemName: RECEIPT_ITEM_NAME,
        qty: 1,
        amount: order.totalPaid,
        wmOrderId: order.wmOrderId,
        buyerName: null,
        taxId: null,
        buyerAddress: null,
        fieldsLocked: false, // 空白待填
        shareToken: randomBytes(16).toString('hex'),
      },
    })
  } catch (e) {
    // 併發：同訂單被同時建立（orderId unique）→ 回傳既有那筆。
    if ((e as Prisma.PrismaClientKnownRequestError)?.code === 'P2002') {
      const again = await prisma.receipt.findUnique({ where: { orderId } })
      if (again) return again
    }
    throw e
  }
}

// 「我的」可開立收據訂單清單（付款已收；含轉贈後仍歸屬本人者）。
// 後備：對沒有收據的訂單補建空白收據（正常付款時已建，此為保險），確保清單每筆都有收據。
export async function listReceiptableOrders(userId: string) {
  const where = {
    OR: [{ currentOwnerId: userId }, { userId }],
    status: { in: RECEIPTABLE_STATUS },
    paidAt: { not: null },
  }
  const ids = await prisma.order.findMany({ where, select: { id: true, receipt: { select: { id: true } } } })
  await Promise.all(ids.filter(o => !o.receipt).map(o => ensureReceiptForOrder(o.id)))

  return prisma.order.findMany({
    where,
    orderBy: { paidAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      totalPaid: true,
      paidAt: true,
      wmOrderId: true,
      orderItems: { select: { productName: true, qty: true }, take: 1 },
      receipt: { select: { id: true, receiptNumber: true, shareToken: true, type: true, fieldsLocked: true, buyerName: true } },
    },
  })
}

// 消費者填寫買受人資訊（個人／公司）。收據已自動存在；未鎖定時可填，填完鎖定。
export async function fillReceiptInfo(
  userId: string,
  receiptId: string,
  opts: { type: ReceiptType; companyTitlePersonal?: boolean },
): Promise<FillResult> {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, order: { OR: [{ currentOwnerId: userId }, { userId }] } },
    include: { order: { select: { company: { select: { name: true, taxId: true, address: true } } } } },
  })
  if (!receipt) return { ok: false, error: 'NOT_FOUND' }
  if (receipt.fieldsLocked) return { ok: false, error: 'LOCKED' }

  let buyerName: string | null
  let taxId: string | null = null
  let buyerAddress: string | null = null

  if (opts.type === 'company') {
    const co = receipt.order.company
    if (!co) return { ok: false, error: 'NOT_COMPANY_ORDER' }
    if (!co.taxId) return { ok: false, error: 'COMPANY_INFO_MISSING' }
    taxId = co.taxId
    buyerAddress = co.address ?? null
    if (opts.companyTitlePersonal) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { realName: true, displayName: true } })
      buyerName = user?.realName?.trim() || user?.displayName?.trim() || co.name
    } else {
      buyerName = co.name
    }
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { realName: true, displayName: true } })
    buyerName = user?.realName?.trim() || user?.displayName?.trim() || null
  }

  const updated = await prisma.receipt.update({
    where: { id: receipt.id },
    data: { type: opts.type, buyerName, taxId, buyerAddress, fieldsLocked: true },
  })
  return { ok: true, receipt: updated }
}

// 取回本人某收據（owner-scoped）；附下單當時企業（供填寫時判斷可否開公司收據＋抬頭）。
export async function getReceiptForUser(userId: string, receiptId: string) {
  return prisma.receipt.findFirst({
    where: { id: receiptId, order: { OR: [{ currentOwnerId: userId }, { userId }] } },
    include: { order: { select: { company: { select: { name: true, taxId: true } } } } },
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
