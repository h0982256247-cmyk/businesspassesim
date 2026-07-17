import { prisma } from '@/lib/db/prisma'
import type { CouponType, CouponLevel } from '@prisma/client'

// ─── 訂單付款後發回購券 ───────────────────────────────────────────

// 用戶付款成功後發給該用戶一張「下次購買可用」的回饋券。
// 折扣 = 1 − 用戶所屬社群當下的 rebateRate。
// rebateRate = 0 或未加入社群 → 不發券。
// 用 sourceOrderId 連結回原訂單，退款時可精準作廢未使用的券。
export async function issueRepurchaseCouponForOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, userId: true, bundleId: true, bundleSeq: true,
      user: {
        select: {
          id: true, lineUid: true,
          // 社群主回購券折扣依「後台讓利上限」(maxRebateRate)，故一併取租戶設定
          tenantAdmin: { select: { maxRebateRate: true } },
          groupMembership: {
            where: { leftAt: null },
            select: {
              group: { select: { id: true, status: true, rebateRate: true } },
            },
          },
          ownedGroup: { select: { id: true, status: true, rebateRate: true } },
        },
      },
    },
  })

  if (!order?.user) return
  // 同捆（多張 eSIM 一次結帳 = 共用 bundleId 的多筆訂單）只發「一張」回購券——
  // 以整筆購買為單位，只在第一張(bundleSeq=1)發，其餘略過，避免一次合購收到多張。
  if (order.bundleId && order.bundleSeq != null && order.bundleSeq > 1) return
  const memberGroup = order.user.groupMembership?.group
  const ownedGroup = order.user.ownedGroup

  // 折扣來源：
  //   會員  → 1 − 所屬社群讓利率（rebateRate）
  //   社群主 → 1 − 後台讓利上限（maxRebateRate）：社群主享平台最高讓利（用券時 ownerRate=0、不再產生分潤）
  let group: { id: string; status: string } | null = null
  let rebateRate = 0
  if (memberGroup && memberGroup.status === 'APPROVED') {
    group = memberGroup
    rebateRate = Number(memberGroup.rebateRate)
  } else if (ownedGroup && ownedGroup.status === 'APPROVED') {
    group = ownedGroup
    rebateRate = Number(order.user.tenantAdmin?.maxRebateRate ?? ownedGroup.rebateRate)
  }
  if (!group || rebateRate <= 0) return  // 非社群成員/社群主、或無讓利 → 無券可發

  const discount = Math.round((1 - rebateRate) * 100) / 100

  // 冪等檢查：同一訂單已發過回購券就不再發
  const existing = await prisma.coupon.findFirst({
    where: { sourceOrderId: orderId, type: 'GROUP_REPURCHASE' },
    select: { id: true },
  })
  if (existing) return

  await prisma.coupon.create({
    data: {
      ownerId: order.user!.id,
      ownerUid: order.user!.lineUid,
      type: 'GROUP_REPURCHASE',
      level: getCouponLevel(discount),
      discount,
      isOfficial: false,
      sourceGroupId: group.id,
      sourceOrderId: orderId,
      expiresAt: null, // 回購券無使用期限
    },
  })
}

// ─── 訂單退款：歸還已使用的券 + 作廢由該訂單發出的回購券 ──────────

// 接受一組訂單 id（單張退款傳 [orderId]；整捆全退傳整捆所有 id）。
// 注意：合購時「使用的券」掛在錨單（usedOrderId = 第一筆），「回購券」則各筆各自發
// （sourceOrderId = 各筆），故整捆退券務必把整捆所有 id 都帶進來，才不會漏。
// 只在「整捆全退」時呼叫——單張部分退款不動優惠券（避免只退一張卻把整批券還回去）。
export async function restoreCouponsForRefundedOrders(orderIds: string[]): Promise<{ restored: number; voided: number }> {
  if (orderIds.length === 0) return { restored: 0, voided: 0 }
  const now = new Date()
  const graceUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)  // 14 天寬限

  return prisma.$transaction(async tx => {
    // 找出這些訂單使用過的所有券
    const consumed = await tx.coupon.findMany({
      where: { usedOrderId: { in: orderIds } },
      select: { id: true, expiresAt: true },
    })

    // 歸還：清 usedAt / usedOrderId；過期的話延 14 天
    for (const c of consumed) {
      await tx.coupon.update({
        where: { id: c.id },
        data: {
          usedAt: null,
          usedOrderId: null,
          expiresAt: c.expiresAt && c.expiresAt < now ? graceUntil : c.expiresAt,
        },
      })
    }

    // 作廢這些訂單發出但未使用的回購券
    const voided = await tx.coupon.updateMany({
      where: {
        sourceOrderId: { in: orderIds },
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { expiresAt: now },
    })

    return { restored: consumed.length, voided: voided.count }
  })
}

export interface IssueCouponInput {
  ownerId: string
  ownerUid: string
  type: CouponType
  discount: number          // 0.70 ~ 0.99
  isOfficial?: boolean
  sourceGroupId?: string
  expiresAt?: Date
}

export function getCouponLevel(discount: number): CouponLevel {
  if (discount < 0.8) return 'A'
  if (discount < 0.9) return 'B'
  return 'C'
}

export async function issueCoupon(input: IssueCouponInput) {
  return prisma.coupon.create({
    data: {
      ownerId: input.ownerId,
      ownerUid: input.ownerUid,
      type: input.type,
      level: getCouponLevel(input.discount),
      discount: input.discount,
      isOfficial: input.isOfficial ?? false,
      sourceGroupId: input.sourceGroupId ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  })
}

// ─── 驗證組合規則（A/B/C 等級）────────────────────────────────────

export function validateCouponCombination(discounts: number[]): { valid: boolean; reason?: string } {
  if (discounts.length === 0) return { valid: true }

  const levels = discounts.map(getCouponLevel)

  if (levels.includes('A') && levels.length > 1) {
    return { valid: false, reason: 'A 級券不可與其他券併用' }
  }

  const bCount = levels.filter(l => l === 'B').length
  const cCount = levels.filter(l => l === 'C').length

  if (bCount > 1) {
    return { valid: false, reason: '不可同時使用多張 B 級券' }
  }
  if (bCount > 0 && cCount > 1) {
    return { valid: false, reason: 'B 級券最多只能搭配 1 張 C 級券' }
  }
  if (cCount > 3) {
    return { valid: false, reason: 'C 級券最多同時使用 3 張' }
  }

  return { valid: true }
}

// 連續折扣計算（非加總）
export function calculateFinalPrice(price: number, discounts: number[]): number {
  const result = discounts.reduce((acc, d) => acc * d, price)
  return Math.round(result)
}

// ─── 查詢 ─────────────────────────────────────────────────────────

export async function getUserCoupons(userId: string) {
  const now = new Date()
  return prisma.coupon.findMany({
    where: {
      ownerId: userId,
      usedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      level: true,
      discount: true,
      isOfficial: true,
      expiresAt: true,
      createdAt: true,
      sourceGroupId: true,
    },
  })
}

export async function getUserCouponsIncludingUsed(userId: string) {
  return prisma.coupon.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      level: true,
      discount: true,
      isOfficial: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  })
}

// ─── 驗證所有權與有效性 ───────────────────────────────────────────

export type CouponValidationResult =
  | { ok: true; coupon: { id: string; discount: number; level: CouponLevel; sourceGroupId: string | null } }
  | { ok: false; reason: string }

export async function validateCouponOwnership(
  couponId: string,
  lineUid: string
): Promise<CouponValidationResult> {
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: {
      id: true,
      ownerUid: true,
      discount: true,
      level: true,
      usedAt: true,
      expiresAt: true,
      sourceGroupId: true,
    },
  })

  if (!coupon) return { ok: false, reason: '優惠券不存在' }
  if (coupon.ownerUid !== lineUid) return { ok: false, reason: '此優惠券不屬於你' }
  if (coupon.usedAt) return { ok: false, reason: '此優惠券已使用' }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { ok: false, reason: '此優惠券已過期' }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      discount: Number(coupon.discount),
      level: coupon.level,
      sourceGroupId: coupon.sourceGroupId,
    },
  }
}

// ─── Admin 發券 ───────────────────────────────────────────────────

export interface BatchIssueCouponInput {
  userIds: string[]          // User.id 列表
  type: CouponType
  discount: number
  isOfficial?: boolean
  sourceGroupId?: string
  expiresAt?: Date
}

export async function batchIssueCoupons(input: BatchIssueCouponInput): Promise<{ count: number }> {
  // 先取得這些 user 的 id + lineUid
  const users = await prisma.user.findMany({
    where: { id: { in: input.userIds } },
    select: { id: true, lineUid: true },
  })

  const level = getCouponLevel(input.discount)

  const result = await prisma.coupon.createMany({
    data: users.map(u => ({
      ownerId: u.id,
      ownerUid: u.lineUid,
      type: input.type,
      level,
      discount: input.discount,
      isOfficial: input.isOfficial ?? false,
      sourceGroupId: input.sourceGroupId ?? null,
      expiresAt: input.expiresAt ?? null,
    })),
  })

  return { count: result.count }
}
