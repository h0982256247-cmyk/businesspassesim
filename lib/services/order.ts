import { prisma } from '@/lib/db/prisma'
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client'
import { validateCouponOwnership, validateCouponCombination, calculateFinalPrice } from './coupon'
import { getProductById } from './product'

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

// ─── 建立訂單（結帳第一步）────────────────────────────────────────

export interface CreateOrderInput {
  userId: string
  lineUid: string
  productId: string
  couponIds: string[]
  paymentMethod: PaymentMethod
  /** 買家所屬租戶；商品必須屬於此租戶才能下單（多租戶隔離）。 */
  tenantAdminId?: string | null
}

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: string; totalPaid: number; subtotal: number; discountAmount: number }
  | { ok: false; reason: string }

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const product = await getProductById(input.productId, input.tenantAdminId)
  if (!product) return { ok: false, reason: '商品不存在或已下架' }

  const subtotal = product.sellPrice

  // 驗證優惠券
  const validatedCoupons: Array<{ id: string; discount: number; sourceGroupId: string | null }> = []
  for (const cid of input.couponIds) {
    const r = await validateCouponOwnership(cid, input.lineUid)
    if (!r.ok) return { ok: false, reason: r.reason }
    validatedCoupons.push(r.coupon)
  }

  const discounts = validatedCoupons.map(c => c.discount)
  const combo = validateCouponCombination(discounts)
  if (!combo.valid) return { ok: false, reason: combo.reason ?? '優惠券組合無效' }

  const totalPaid = calculateFinalPrice(subtotal, discounts)
  const discountAmount = subtotal - totalPaid

  // 生成訂單號（衝突時最多重試 3 次）
  let orderNumber = generateOrderNumber()
  for (let attempt = 0; attempt < 3; attempt++) {
    const exists = await prisma.order.findUnique({ where: { orderNumber } })
    if (!exists) break
    orderNumber = generateOrderNumber()
  }

  let order
  try {
    order = await prisma.$transaction(async tx => {
      const o = await tx.order.create({
        data: {
          userId: input.userId,
          currentOwnerId: input.userId,   // 預設買家就是擁有者；轉贈後會改成接收者
          orderNumber,
          status: OrderStatus.PENDING,
          subtotal,
          discountAmount,
          totalPaid,
          taxAmount: 0,
          paymentMethod: input.paymentMethod,
          orderItems: {
            create: {
              productId: input.productId,
              // 快照存完整方案（國家 N天 + 流量），供應商改規格/下架不影響歷史訂單顯示
              productName: `${product.countryNameZh} ${product.displayDays}天${product.dataCapacity ? ` ${product.dataCapacity}` : ''}`,
              qty: 1,
              unitPrice: subtotal,
              unitCost: product.costPrice,   // 鎖死成本快照，後續供應商改價不影響歷史訂單
            },
          },
          orderCoupons: {
            create: validatedCoupons.map(c => ({
              couponId: c.id,
              discountApplied: c.discount,
            })),
          },
        },
      })

      // 標記優惠券已使用：條件式 updateMany（usedAt 必須仍為 null）。
      // 兩筆並發結帳用同一張券時，只有一筆會 count===1，另一筆 throw → 整筆 rollback，
      // 避免同券雙花。
      for (const c of validatedCoupons) {
        const r = await tx.coupon.updateMany({
          where: { id: c.id, usedAt: null },
          data: { usedAt: new Date(), usedOrderId: o.id },
        })
        if (r.count !== 1) throw new Error('COUPON_ALREADY_USED')
      }

      return o
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'COUPON_ALREADY_USED') {
      return { ok: false, reason: '優惠券已被使用，請重新整理後再試' }
    }
    throw err
  }

  return {
    ok: true,
    orderId: order.id,
    orderNumber: order.orderNumber ?? orderNumber,
    totalPaid,
    subtotal,
    discountAmount,
  }
}

// ─── 建立多品項訂單包（cart 一次結帳 N 張 eSIM）─────────────────────
//
// Schema constraint: each Order maps to one supplier eSIM (esimRcode/wmOrderId
// live on Order itself, not OrderItem). So a multi-item cart is materialized
// as N independent Orders sharing a `bundleId`. The TapPay charge happens
// once for the sum; the notify webhook fans out to every order in the bundle.
//
// Coupons are intentionally NOT supported here in v1 — the existing single-
// order coupon validation assumes one subtotal.

export interface BundleCartLine {
  productId: string
  qty: number    // 1-9, expanded into N orders
}

export interface CreateBundleOrdersInput {
  userId: string
  lineUid: string
  lines: BundleCartLine[]
  paymentMethod: PaymentMethod
  couponIds?: string[]
  /** 買家所屬租戶；每張商品都必須屬於此租戶才能下單（多租戶隔離）。 */
  tenantAdminId?: string | null
}

// 把「總折扣」按各筆原價比例攤到每一筆（最大餘數法）。
// 回傳整數陣列，加總必定 === total，且每筆 ≤ 對應原價（total ≤ Σweights 時成立）。
// 折總額才能讓「整車 = 各張分開買用同一組券」三方數字一致。
export function allocateDiscountByWeight(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map(w => (total * w) / sum)
  const floored = raw.map(Math.floor)
  const remainder = total - floored.reduce((a, b) => a + b, 0)
  // 餘數分給小數部分最大的幾筆
  const byFrac = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac)
  const result = [...floored]
  for (let k = 0; k < remainder && k < byFrac.length; k++) result[byFrac[k].i]++
  return result
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
  const products = await Promise.all(uniqueIds.map(id => getProductById(id, input.tenantAdminId)))
  const productMap = new Map<string, NonNullable<Awaited<ReturnType<typeof getProductById>>>>()
  for (let i = 0; i < uniqueIds.length; i++) {
    const p = products[i]
    if (!p) return { ok: false, reason: `商品不存在或已下架：${uniqueIds[i]}` }
    productMap.set(uniqueIds[i], p)
  }

  const slotPrices = slots.map(s => productMap.get(s.productId)!.sellPrice)
  const subtotal = slotPrices.reduce((sum, p) => sum + p, 0)

  // ── 優惠券：在「總額」上驗證組合 + 連續相乘算折扣，再按各筆原價比例攤回每筆 ──
  const couponIds = input.couponIds ?? []
  const validatedCoupons: Array<{ id: string; discount: number; sourceGroupId: string | null }> = []
  for (const cid of couponIds) {
    const r = await validateCouponOwnership(cid, input.lineUid)
    if (!r.ok) return { ok: false, reason: r.reason }
    validatedCoupons.push(r.coupon)
  }
  const discounts = validatedCoupons.map(c => c.discount)
  const combo = validateCouponCombination(discounts)
  if (!combo.valid) return { ok: false, reason: combo.reason ?? '優惠券組合無效' }

  const totalPaid = calculateFinalPrice(subtotal, discounts)
  const totalDiscount = subtotal - totalPaid
  const slotDiscounts = allocateDiscountByWeight(slotPrices, totalDiscount)
  const bundleId = generateBundleId()

  // Pre-generate unique order numbers OUTSIDE the transaction. The uniqueness
  // probe (findUnique) is the slow part — running it inside the interactive
  // transaction keeps a DB connection pinned for the whole batch, which on a
  // remote DB behind PgBouncer easily blows past Prisma's 5s transaction
  // timeout (→ P2028 throw → 500 → frontend shows「網路錯誤」). Generating the
  // numbers up front means the transaction only does the N inserts.
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
        const discountAmount = slotDiscounts[i]
        const o = await tx.order.create({
          data: {
            userId: input.userId,
            currentOwnerId: input.userId,
            orderNumber: orderNumbers[i],
            bundleId,
            bundleSeq: i + 1,
            status: OrderStatus.PENDING,
            subtotal: p.sellPrice,
            discountAmount,
            totalPaid: p.sellPrice - discountAmount,
            taxAmount: 0,
            paymentMethod: input.paymentMethod,
            orderItems: {
              create: {
                productId: p.id,
                // 快照存完整方案（國家 N天 + 流量），供應商改規格/下架不影響歷史訂單顯示
                productName: `${p.countryNameZh} ${p.displayDays}天${p.dataCapacity ? ` ${p.dataCapacity}` : ''}`,
                qty: 1,
                unitPrice: p.sellPrice,
                unitCost: p.costPrice,
              },
            },
            // 折總額：同一組券掛到 bundle 內每一筆，讓分潤可逐筆用各自 subtotal 計算
            // （Σ 分潤 = ownerRate × 總原價）。coupon 本身只標記用在錨單一次（見下）。
            ...(validatedCoupons.length > 0 ? {
              orderCoupons: {
                create: validatedCoupons.map(c => ({ couponId: c.id, discountApplied: c.discount })),
              },
            } : {}),
          },
        })
        ids.push(o.id)
      }

      // 標記優惠券已使用：usedOrderId 指向錨單（bundle 第一筆）。條件式 updateMany
      // （usedAt 必須仍為 null）擋並發雙花；任一張搶不到 → throw → 整批 rollback。
      if (validatedCoupons.length > 0) {
        const anchorId = ids[0]
        for (const c of validatedCoupons) {
          const r = await tx.coupon.updateMany({
            where: { id: c.id, usedAt: null },
            data: { usedAt: new Date(), usedOrderId: anchorId },
          })
          if (r.count !== 1) throw new Error('COUPON_ALREADY_USED')
        }
      }
      return ids
    }, {
      // N sequential inserts over a remote/pooled connection need headroom
      // beyond Prisma's 5s default; otherwise large carts throw P2028.
      timeout: 20_000,
      maxWait: 10_000,
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'COUPON_ALREADY_USED') {
      return { ok: false, reason: '優惠券已被使用，請重新整理後再試' }
    }
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
  // 一併歸還訂單創建時佔用的優惠券（usedAt/usedOrderId 還原）
  // 保留原 expiresAt，因為券「沒實際被消耗」，不需要寬限期
  return prisma.$transaction(async tx => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.FAILED,
        ...(reason ? { failureReason: reason } : {}),
      },
    })
    await tx.coupon.updateMany({
      where: { usedOrderId: orderId },
      data: { usedAt: null, usedOrderId: null },
    })
  })
}

export async function markBundleFailed(bundleId: string, reason?: string) {
  return prisma.$transaction(async tx => {
    await tx.order.updateMany({
      where: { bundleId, status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] } },
      data: {
        status: OrderStatus.FAILED,
        ...(reason ? { failureReason: reason } : {}),
      },
    })
    // Bundle orders are coupon-less in v1, but keep this for forward compat.
    const orders = await tx.order.findMany({ where: { bundleId }, select: { id: true } })
    await tx.coupon.updateMany({
      where: { usedOrderId: { in: orders.map(o => o.id) } },
      data: { usedAt: null, usedOrderId: null },
    })
  })
}

export async function markOrderCancelled(orderId: string, reason?: string) {
  return prisma.$transaction(async tx => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        ...(reason ? { cancelReason: reason } : {}),
      },
    })
    await tx.coupon.updateMany({
      where: { usedOrderId: orderId },
      data: { usedAt: null, usedOrderId: null },
    })
  })
}

export async function markOrderRefunded(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.REFUNDED },
  })
}

// 取消超過 30 分鐘未完成付款的訂單，並歸還該訂單佔用的優惠券。
// 涵蓋 PENDING（尚未送出金流）與 PROCESSING（已送出／3DS 進行中但使用者放棄、
// 銀行未回傳 notify）——後者若稍後仍收到成功 notify，notify route 會走
// 「訂單已 CANCELLED → 自動退款」保護路徑，不會誤發卡。
export async function cancelExpiredPendingOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000)

  return prisma.$transaction(async tx => {
    const expired = await tx.order.findMany({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    })
    if (expired.length === 0) return 0

    const ids = expired.map(o => o.id)
    await tx.order.updateMany({
      where: { id: { in: ids } },
      data: { status: OrderStatus.CANCELLED, cancelReason: '逾時自動取消（30 分鐘未完成付款）' },
    })
    await tx.coupon.updateMany({
      where: { usedOrderId: { in: ids } },
      data: { usedAt: null, usedOrderId: null },
    })
    return ids.length
  })
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
      ...esimData,
    },
  })
}

// ─── 查詢 ─────────────────────────────────────────────────────────

export async function getUserOrders(userId: string) {
  // 目前擁有的訂單（含轉贈進來的，用 currentOwnerId）+ 自己轉贈出去且已被領取的訂單
  // （userId 仍是原買家、但 currentOwnerId 已變對方）→ 保留在歷史顯示「已轉贈給 ○○○」。
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { currentOwnerId: userId },
        { userId, NOT: { currentOwnerId: userId }, gift: { is: { claimedAt: { not: null } } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalPaid: true,
      subtotal: true,
      discountAmount: true,
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
      gift: {
        select: {
          claimedAt: true,
          cancelledAt: true,
          expiresAt: true,
          fromUser:    { select: { displayName: true } },
          toUser:      { select: { displayName: true } },
          recipientName: true,
        },
      },
    },
  })
  // transferredAway：這張是「我買的、已轉贈出去」的訂單（currentOwnerId 已非我）
  return orders.map(o => ({ ...o, transferredAway: o.currentOwnerId !== userId }))
}

// LIFF 使用者存取「自己的」訂單的單一入口（fail-closed）：owner 條件進 where，
// 漏帶或非擁有者一律查不到（回 null → route 統一 404，不洩漏訂單存在性）。
// 轉贈後以 currentOwnerId 為準（原買家轉出後即不可再存取）；select 由呼叫端決定。
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

// platform 後台對 Order 的租戶過濾片段（fail-closed）：白牌 admin（tenantAdminId 有值）
// 只能看自己租戶的訂單（透過 user relation）；SUPER_ADMIN（tenantAdminId=null）回空條件、看全部。
// 對應 LIFF 端 getOrderForOwner；platform 查詢多樣（findFirst/findMany/count），故只抽 where 片段。
export function orderTenantWhere(tenantAdminId: string | null): Prisma.OrderWhereInput {
  return tenantAdminId ? { user: { tenantAdminId } } : {}
}

export async function getOrderByIdForUser(orderId: string, userId: string) {
  // 用 currentOwnerId 查詢：原買家轉贈出去後就不再能存取此訂單細節（QR/兌換碼）
  return prisma.order.findFirst({
    where: { id: orderId, currentOwnerId: userId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      subtotal: true,
      discountAmount: true,
      totalPaid: true,
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
        // 另 join 商品流量(dataCapacity)，供詳情顯示與轉贈 Flex 訊息標示完整方案
        select: { productName: true, qty: true, unitPrice: true, product: { select: { dataCapacity: true } } },
      },
      gift: {
        select: {
          token: true,
          sharedAt: true,
          expiresAt: true,
          claimedAt: true,
          cancelledAt: true,
          recipientName: true,
          toUser: { select: { displayName: true } },
          fromUser: { select: { displayName: true } },
        },
      },
    },
  })
}

// ─── Retry 計數 ───────────────────────────────────────────────────

export async function incrementRetryCount(orderId: string) {
  return prisma.order.update({
    where: { id: orderId },
    data: { retryCount: { increment: 1 }, lastRetryAt: new Date() },
  })
}
