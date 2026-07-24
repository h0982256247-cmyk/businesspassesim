import { prisma } from '@/lib/db/prisma'
import { encryptEsimFields, decryptEsimFields } from '@/lib/utils/esim-crypto'
import { OrderStatus, PaymentMethod, PriceTier, Prisma } from '@prisma/client'
import { getProductById } from './product'
import { isApprovedMember } from './group'

// ─── 訂單號生成 ───────────────────────────────────────────────────
// 格式：ESM-YYMMDD-XXXXXX（去除易混淆字元 I/O/0/1）
const ORDER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateOrderNumber(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const suffix = Array.from({ length: 6 }, () =>
    ORDER_CHARS[Math.floor(Math.random() * ORDER_CHARS.length)]
  ).join('')
  return `ESM-${yy}${mm}${dd}-${suffix}`
}

// 依會員身分取「成交單價」：已核准企業會員 → 福利價；否則一般售價。
// 回傳成交價 + 企業歸屬 + priceTier，供下單寫入 Order/OrderItem。
async function resolvePricing(userId: string, product: { sellPrice: number; benefitPrice: number }) {
  const tier = await isApprovedMember(userId)
  return {
    unitPrice: tier.isMember ? product.benefitPrice : product.sellPrice,
    companyId: tier.groupId,
    priceTier: tier.isMember ? PriceTier.BENEFIT : PriceTier.GENERAL,
  }
}

// ─── 建立訂單（結帳第一步）────────────────────────────────────────

export interface CreateOrderInput {
  userId: string
  productId: string
  paymentMethod: PaymentMethod
}

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: string; totalPaid: number; subtotal: number }
  | { ok: false; reason: string }

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const product = await getProductById(input.productId)
  if (!product) return { ok: false, reason: '商品不存在或已下架' }

  const { unitPrice, companyId, priceTier } = await resolvePricing(input.userId, product)
  const subtotal = unitPrice
  const totalPaid = unitPrice

  // 生成訂單號（衝突時最多重試 3 次）
  let orderNumber = generateOrderNumber()
  for (let attempt = 0; attempt < 3; attempt++) {
    const exists = await prisma.order.findUnique({ where: { orderNumber } })
    if (!exists) break
    orderNumber = generateOrderNumber()
  }

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      currentOwnerId: input.userId,   // 擁有權初始＝買家（轉贈後會變）
      companyId,
      priceTier,
      orderNumber,
      status: OrderStatus.PENDING,
      subtotal,
      totalPaid,
      taxAmount: 0,
      paymentMethod: input.paymentMethod,
      orderItems: {
        create: {
          productId: input.productId,
          // 快照存完整方案（國家 N天 + 流量），供應商改規格/下架不影響歷史訂單顯示
          productName: `${product.countryNameZh} ${product.displayDays}天${product.dataCapacity ? ` ${product.dataCapacity}` : ''}`,
          qty: 1,
          // 三價 + 成交價快照（PRD 七）：後續改價不影響歷史訂單
          unitCost: product.costPrice,
          unitBenefit: product.benefitPrice,
          unitSell: product.sellPrice,
          unitPrice,
        },
      },
    },
  })

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber ?? orderNumber,
    totalPaid,
    subtotal,
  }
}

// ─── 建立多品項訂單包（cart 一次結帳 N 張 eSIM）─────────────────────
//
// Schema constraint: each Order maps to one supplier eSIM (esimRcode/wmOrderId
// live on Order itself, not OrderItem). So a multi-item cart is materialized
// as N independent Orders sharing a `bundleId`. The TapPay charge happens
// once for the sum; the notify webhook fans out to every order in the bundle.

export interface BundleCartLine {
  productId: string
  qty: number    // 1-9, expanded into N orders
}

export interface CreateBundleOrdersInput {
  userId: string
  lines: BundleCartLine[]
  paymentMethod: PaymentMethod
}

export type CreateBundleOrdersResult =
  | { ok: true; bundleId: string; orderIds: string[]; orderCount: number; subtotal: number; totalPaid: number }
  | { ok: false; reason: string }

const MAX_BUNDLE_ITEMS = 20

function generateBundleId(): string {
  // Short URL-safe id; collision space is large because it's scoped to one user.
  return 'BDL-' + Array.from({ length: 12 }, () =>
    ORDER_CHARS[Math.floor(Math.random() * ORDER_CHARS.length)]
  ).join('')
}

export async function createBundleOrders(input: CreateBundleOrdersInput): Promise<CreateBundleOrdersResult> {
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, reason: '購物車是空的' }
  }

  // Expand qty into individual order slots
  const slots: { productId: string }[] = []
  for (const line of input.lines) {
    const qty = Math.max(1, Math.min(9, Math.floor(line.qty || 1)))
    for (let i = 0; i < qty; i++) slots.push({ productId: line.productId })
  }

  if (slots.length === 0) return { ok: false, reason: '購物車是空的' }
  if (slots.length > MAX_BUNDLE_ITEMS) {
    return { ok: false, reason: `單次結帳最多 ${MAX_BUNDLE_ITEMS} 張，請拆批購買` }
  }

  // Fetch products once (dedupe by id)
  const uniqueIds = Array.from(new Set(slots.map(s => s.productId)))
  const products = await Promise.all(uniqueIds.map(id => getProductById(id)))
  const productMap = new Map<string, NonNullable<Awaited<ReturnType<typeof getProductById>>>>()
  for (let i = 0; i < uniqueIds.length; i++) {
    const p = products[i]
    if (!p) return { ok: false, reason: `商品不存在或已下架：${uniqueIds[i]}` }
    productMap.set(uniqueIds[i], p)
  }

  // 依會員身分取價（整車一致）：已核准企業會員 → 福利價；否則一般售價
  const tier = await isApprovedMember(input.userId)
  const priceOf = (p: { sellPrice: number; benefitPrice: number }) => tier.isMember ? p.benefitPrice : p.sellPrice
  const companyId = tier.groupId
  const priceTier = tier.isMember ? PriceTier.BENEFIT : PriceTier.GENERAL

  const slotPrices = slots.map(s => priceOf(productMap.get(s.productId)!))
  const subtotal = slotPrices.reduce((sum, p) => sum + p, 0)
  const totalPaid = subtotal   // 無優惠券，實付＝小計
  const bundleId = generateBundleId()

  // Pre-generate unique order numbers OUTSIDE the transaction. The uniqueness
  // probe (findUnique) is the slow part — running it inside the interactive
  // transaction keeps a DB connection pinned for the whole batch, which on a
  // remote DB behind PgBouncer easily blows past Prisma's 5s transaction
  // timeout. Generating the numbers up front means the transaction only does
  // the N inserts.
  const usedNumbers = new Set<string>()
  const orderNumbers: string[] = []
  for (let i = 0; i < slots.length; i++) {
    let orderNumber = generateOrderNumber()
    for (let attempt = 0; attempt < 5; attempt++) {
      const collides = usedNumbers.has(orderNumber)
        || (await prisma.order.findUnique({ where: { orderNumber }, select: { id: true } })) !== null
      if (!collides) break
      orderNumber = generateOrderNumber()
    }
    usedNumbers.add(orderNumber)
    orderNumbers.push(orderNumber)
  }

  let orderIds: string[]
  try {
    orderIds = await prisma.$transaction(async tx => {
      const ids: string[] = []
      for (let i = 0; i < slots.length; i++) {
        const p = productMap.get(slots[i].productId)!
        const unitPrice = slotPrices[i]
        const o = await tx.order.create({
          data: {
            userId: input.userId,
            currentOwnerId: input.userId,   // 擁有權初始＝買家（轉贈後會變）
            companyId,
            priceTier,
            orderNumber: orderNumbers[i],
            bundleId,
            bundleSeq: i + 1,
            status: OrderStatus.PENDING,
            subtotal: unitPrice,
            totalPaid: unitPrice,
            taxAmount: 0,
            paymentMethod: input.paymentMethod,
            orderItems: {
              create: {
                productId: p.id,
                productName: `${p.countryNameZh} ${p.displayDays}天${p.dataCapacity ? ` ${p.dataCapacity}` : ''}`,
                qty: 1,
                unitCost: p.costPrice,
                unitBenefit: p.benefitPrice,
                unitSell: p.sellPrice,
                unitPrice,
              },
            },
          },
        })
        ids.push(o.id)
      }
      return ids
    }, {
      // N sequential inserts over a remote/pooled connection need headroom
      // beyond Prisma's 5s default; otherwise large carts throw P2028.
      timeout: 20_000,
      maxWait: 10_000,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : '建立訂單失敗'
    return { ok: false, reason: `建立訂單失敗：${reason}` }
  }

  return {
    ok: true,
    bundleId,
    orderIds,
    orderCount: orderIds.length,
    subtotal,
    totalPaid,
  }
}

export async function getBundleOrders(bundleId: string, userId: string) {
  return prisma.order.findMany({
    where: { bundleId, userId },
    orderBy: { bundleSeq: 'asc' },
    include: {
      orderItems: { select: { productName: true, qty: true, unitPrice: true, productId: true } },
    },
  })
}

// ─── 逾時判斷（30 分鐘）─────────────────────────────────────────────
export const ORDER_EXPIRY_MS = 30 * 60 * 1000

export function isOrderExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > ORDER_EXPIRY_MS
}

// ─── 訂單狀態更新 ─────────────────────────────────────────────────

// 只把 PENDING → PROCESSING（條件式 updateMany）。回傳是否真的取得鎖：
// 兩個並發付款請求只有一個會 count===1，另一個 count===0 → 呼叫端中止，避免重複扣款。
export async function markOrderProcessing(orderId: string, tapPayOrderId: string): Promise<boolean> {
  const r = await prisma.order.updateMany({
    where: { id: orderId, status: OrderStatus.PENDING },
    data: { status: OrderStatus.PROCESSING, tapPayOrderId },
  })
  return r.count === 1
}

export async function markBundleOrdersProcessing(bundleId: string, anchorOrderId: string, tapPayOrderId: string): Promise<boolean> {
  // Only the anchor carries the unique tapPayOrderId; the rest just flip status.
  // 以 anchor 的條件式更新當作整組的鎖：搶不到 anchor 就整組中止。
  return prisma.$transaction(async tx => {
    const anchor = await tx.order.updateMany({
      where: { id: anchorOrderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PROCESSING, tapPayOrderId },
    })
    if (anchor.count !== 1) return false
    await tx.order.updateMany({
      where: { bundleId, id: { not: anchorOrderId }, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PROCESSING },
    })
    return true
  })
}

export async function markOrderPaid(orderId: string, tapPayRecTradeId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.PAID,
      tapPayRecTradeId,
      paidAt: new Date(),
    },
  })
}

export async function markBundlePaid(bundleId: string, tapPayRecTradeId: string) {
  // Fan out the anchor's PAID status (and the shared recTradeId) to every
  // sibling in the bundle. Returns the affected order ids so the caller can
  // trigger eSIM activation per-order.
  const paidAt = new Date()
  await prisma.order.updateMany({
    where: { bundleId, status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] } },
    data: { status: OrderStatus.PAID, tapPayRecTradeId, paidAt },
  })
  const orders = await prisma.order.findMany({
    where: { bundleId },
    select: { id: true, userId: true, totalPaid: true, orderItems: { select: { productName: true }, take: 1 } },
    orderBy: { bundleSeq: 'asc' },
  })
  return orders
}

export async function markOrderFailed(orderId: string, reason?: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.FAILED,
      ...(reason ? { failureReason: reason } : {}),
    },
  })
}

export async function markBundleFailed(bundleId: string, reason?: string) {
  return prisma.order.updateMany({
    where: { bundleId, status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] } },
    data: {
      status: OrderStatus.FAILED,
      ...(reason ? { failureReason: reason } : {}),
    },
  })
}

export async function markOrderCancelled(orderId: string, reason?: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.CANCELLED,
      ...(reason ? { cancelReason: reason } : {}),
    },
  })
}

export async function markOrderRefunded(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.REFUNDED },
  })
}

// 取消超過 30 分鐘未完成付款的訂單。涵蓋 PENDING（尚未送出金流）與 PROCESSING
// （已送出／3DS 進行中但使用者放棄、銀行未回傳 notify）——後者若稍後仍收到成功
// notify，notify route 會走「訂單已 CANCELLED → 自動退款」保護路徑，不會誤發卡。
export async function cancelExpiredPendingOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_MS)

  const result = await prisma.order.updateMany({
    where: {
      status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
      createdAt: { lt: cutoff },
    },
    data: { status: OrderStatus.CANCELLED, cancelReason: '逾時自動取消（30 分鐘未完成付款）' },
  })
  return result.count
}

export async function markOrderCompleted(orderId: string, esimData: {
  wmOrderId?: string
  wmOrderSn?: string
  wmOrderTime?: string
  esimRcode?: string
  esimQrcode?: string
  esimLpa?: string
  esimPin1?: string
  esimPin2?: string
  esimPuk1?: string
  esimPuk2?: string
  esimCfCode?: string
  esimApnExplain?: string
  esimIccid?: string
  activationStart?: Date
  activationEnd?: Date
}) {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.COMPLETED,
      // 憑證欄位加密後才落地（單一來源見 lib/utils/esim-crypto）
      ...encryptEsimFields(esimData),
    },
  })
}

// ─── 查詢 ─────────────────────────────────────────────────────────

export async function getUserOrders(userId: string) {
  // 「我的 eSIM」＝我目前擁有的（含轉贈收到的）＋ 我買過但已轉贈出去的（歷史顯示）
  const orders = await prisma.order.findMany({
    where: { OR: [{ currentOwnerId: userId }, { userId }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalPaid: true,
      subtotal: true,
      priceTier: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
      userId: true,
      currentOwnerId: true,
      bundleId: true,
      failureReason: true,
      cancelReason: true,
      esimRcode: true,
      esimQrcode: true,
      esimIccid: true,
      activationStart: true,
      activationEnd: true,
      redeemedAt: true,
      activatedAt: true,
      orderItems: {
        // product_name 快照只存「國家 N天」（不含流量），同天數不同流量會看起來一樣，
        // 故另 join 目前商品的流量(dataCapacity) 供列表卡片區分方案。
        select: { productName: true, qty: true, unitPrice: true, product: { select: { dataCapacity: true } } },
      },
      transfer: {
        select: {
          claimedAt: true, cancelledAt: true, expiresAt: true,
          fromUser: { select: { displayName: true } },
          toUser: { select: { displayName: true } },
        },
      },
    },
  })
  return orders.map(({ currentOwnerId, transfer, ...o }) => ({
    // 憑證欄位在 DB 為密文，回前端前解密（safeDecrypt 相容舊明文）
    ...decryptEsimFields(o),
    transferredAway: o.userId === userId && currentOwnerId !== userId,   // 我買的、已轉贈出去
    receivedGift: currentOwnerId === userId && o.userId !== userId,      // 我收到的轉贈
    gift: transfer ? {
      claimedAt: transfer.claimedAt ? transfer.claimedAt.toISOString() : null,
      cancelledAt: transfer.cancelledAt ? transfer.cancelledAt.toISOString() : null,
      expiresAt: transfer.expiresAt.toISOString(),
      toName: transfer.toUser?.displayName ?? null,
      fromName: transfer.fromUser?.displayName ?? null,
    } : null,
  }))
}

// LIFF 使用者存取「自己目前擁有」訂單的單一入口（fail-closed）：以 currentOwnerId 過濾，
// 非目前擁有者一律查不到（回 null → route 統一 404）。安裝/查流量都應由目前擁有者操作。
// select 由呼叫端決定。
export function getOrderForOwner<S extends Prisma.OrderSelect>(
  orderId: string,
  userId: string,
  select: S,
): Promise<Prisma.OrderGetPayload<{ select: S }> | null> {
  return prisma.order.findFirst({
    where: { id: orderId, currentOwnerId: userId },
    select,
  }) as Promise<Prisma.OrderGetPayload<{ select: S }> | null>
}

export async function getOrderByIdForUser(orderId: string, userId: string) {
  // 可存取條件：我目前擁有（含收到的轉贈）或我是買家（已轉贈出去也看得到歷史）
  const o = await prisma.order.findFirst({
    where: { id: orderId, OR: [{ currentOwnerId: userId }, { userId }] },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      subtotal: true,
      totalPaid: true,
      priceTier: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      currentOwnerId: true,
      bundleId: true,
      failureReason: true,
      cancelReason: true,
      esimRcode: true,
      esimQrcode: true,
      esimLpa: true,
      esimIccid: true,
      activationStart: true,
      activationEnd: true,
      redeemedAt: true,
      activatedAt: true,
      orderItems: {
        select: { productName: true, qty: true, unitPrice: true, product: { select: { dataCapacity: true } } },
      },
      transfer: {
        select: {
          claimedAt: true, cancelledAt: true, expiresAt: true,
          fromUser: { select: { displayName: true } },
          toUser: { select: { displayName: true } },
        },
      },
    },
  })
  if (!o) return null
  const { currentOwnerId, transfer, ...rest } = o
  return {
    // 憑證欄位在 DB 為密文，回前端前解密（safeDecrypt 相容舊明文）
    ...decryptEsimFields(rest),
    isCurrentOwner: currentOwnerId === userId,                           // 只有目前擁有者可安裝/轉贈
    transferredAway: rest.userId === userId && currentOwnerId !== userId,
    receivedGift: currentOwnerId === userId && rest.userId !== userId,
    gift: transfer ? {
      claimedAt: transfer.claimedAt ? transfer.claimedAt.toISOString() : null,
      cancelledAt: transfer.cancelledAt ? transfer.cancelledAt.toISOString() : null,
      expiresAt: transfer.expiresAt.toISOString(),
      toName: transfer.toUser?.displayName ?? null,
      fromName: transfer.fromUser?.displayName ?? null,
    } : null,
  }
}
