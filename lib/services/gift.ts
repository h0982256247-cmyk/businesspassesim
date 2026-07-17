import { prisma } from '@/lib/db/prisma'
import { OrderStatus } from '@prisma/client'
import { randomBytes } from 'crypto'
import { notifyGiftClaimed } from './notification'

const GIFT_TTL_DAYS = 7
const GIFT_TTL_MS = GIFT_TTL_DAYS * 24 * 60 * 60 * 1000

function generateToken(): string {
  return randomBytes(16).toString('base64url')   // 22 chars, URL-safe
}

// ─── Sender 建立轉贈 ─────────────────────────────────────────────

export type CreateGiftResult =
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; reason: string }

export async function createGift(orderId: string, senderId: string): Promise<CreateGiftResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true,
      currentOwnerId: true,
      redeemedAt: true,
      activatedAt: true,
      orderItems: { select: { id: true } },
      gift: { select: { id: true, claimedAt: true, cancelledAt: true, expiresAt: true } },
    },
  })

  if (!order) return { ok: false, reason: '訂單不存在' }
  if (order.currentOwnerId !== senderId) return { ok: false, reason: '你不是此訂單的擁有者' }
  if (order.status !== OrderStatus.COMPLETED) {
    return { ok: false, reason: 'eSIM 尚未交付，無法轉贈' }
  }
  // redeemedAt 一旦設定 → QR 已產生，可能已被截圖外流 → 禁止轉贈
  if (order.redeemedAt) {
    return { ok: false, reason: '此 eSIM 已開始安裝程序（QR 已產生），無法再轉贈' }
  }
  if (order.activatedAt) {
    return { ok: false, reason: '此 eSIM 已激活（已安裝到裝置），無法再轉贈' }
  }
  if (order.orderItems.length !== 1) {
    return { ok: false, reason: '多項商品訂單暫不支援轉贈' }
  }

  // 已有 active gift（未領取、未過期、未取消）→ 視為「重新分享」，回傳同一個 token
  const existing = order.gift
  const now = new Date()
  if (existing && !existing.claimedAt && !existing.cancelledAt && existing.expiresAt > now) {
    const refreshed = await prisma.orderGift.update({
      where: { id: existing.id },
      data: { expiresAt: new Date(now.getTime() + GIFT_TTL_MS) },
      select: { token: true, expiresAt: true },
    })
    return { ok: true, token: refreshed.token, expiresAt: refreshed.expiresAt }
  }

  // 已被領取 / 取消 / 過期 → 建立新 gift（透過 unique 約束需先 delete 舊的）
  if (existing) {
    if (existing.claimedAt) return { ok: false, reason: '此訂單已被領取，無法再分享' }
    await prisma.orderGift.delete({ where: { id: existing.id } })
  }

  const gift = await prisma.orderGift.create({
    data: {
      orderId,
      token: generateToken(),
      fromUserId: senderId,
      expiresAt: new Date(now.getTime() + GIFT_TTL_MS),
    },
    select: { token: true, expiresAt: true },
  })

  return { ok: true, token: gift.token, expiresAt: gift.expiresAt }
}

// ─── 取消轉贈（sender 主動）──────────────────────────────────────

export async function cancelGift(orderId: string, senderId: string): Promise<{ ok: boolean; reason?: string }> {
  const gift = await prisma.orderGift.findUnique({
    where: { orderId },
    select: { id: true, fromUserId: true, claimedAt: true, cancelledAt: true },
  })
  if (!gift) return { ok: false, reason: '無轉贈紀錄' }
  if (gift.fromUserId !== senderId) return { ok: false, reason: '你不是此轉贈的發起人' }
  if (gift.claimedAt) return { ok: false, reason: '已被領取，無法取消' }
  if (gift.cancelledAt) return { ok: true }   // 已取消，冪等

  await prisma.orderGift.update({
    where: { id: gift.id },
    data: { cancelledAt: new Date(), cancelReason: 'sender_cancel' },
  })
  return { ok: true }
}

// ─── 查詢 token 對應 gift 資訊（recipient 預覽用，不揭露 QR/兌換碼）────

export async function getGiftByToken(token: string) {
  return prisma.orderGift.findUnique({
    where: { token },
    select: {
      id: true,
      orderId: true,
      fromUserId: true,
      toUserId: true,
      sharedAt: true,
      expiresAt: true,
      claimedAt: true,
      cancelledAt: true,
      recipientName: true,
      fromUser: { select: { id: true, displayName: true } },
      order: {
        select: {
          id: true, status: true,
          orderItems: {
            select: { productName: true, product: { select: { countryCode: true, countryFlag: true, dataCapacity: true, displayDays: true } } },
          },
        },
      },
    },
  })
}

// ─── Recipient 領取 ─────────────────────────────────────────────

export type ClaimGiftResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string; needsRegistration?: boolean }

export async function claimGift(token: string, recipientId: string): Promise<ClaimGiftResult> {
  // 取 recipient 資料檢查註冊完整性
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true, phone: true, email: true },
  })
  if (!recipient) return { ok: false, reason: '使用者不存在' }
  if (!recipient.phone || !recipient.email) {
    return { ok: false, reason: '請先完成個人資料註冊', needsRegistration: true }
  }

  // 原子 claim：透過 updateMany + WHERE claimedAt IS NULL 確保只有第一位 claim 成功
  return prisma.$transaction(async tx => {
    const gift = await tx.orderGift.findUnique({
      where: { token },
      select: {
        id: true, orderId: true, fromUserId: true,
        claimedAt: true, cancelledAt: true, expiresAt: true,
        order: { select: { id: true, status: true, currentOwnerId: true, userId: true, redeemedAt: true, activatedAt: true, user: { select: { tenantAdminId: true } } } },
      },
    })

    if (!gift)                       return { ok: false, reason: '此分享連結無效' }
    if (gift.cancelledAt)            return { ok: false, reason: '此分享已被取消' }
    if (gift.claimedAt)              return { ok: false, reason: '此分享已被他人領取' }
    if (gift.expiresAt < new Date()) return { ok: false, reason: '此分享已過期' }
    if (gift.fromUserId === recipientId) return { ok: false, reason: '不能領取自己分享的卡' }
    if (gift.order.status !== OrderStatus.COMPLETED) return { ok: false, reason: 'eSIM 尚未交付' }
    if (gift.order.redeemedAt)       return { ok: false, reason: '此 eSIM 已被原買家開始安裝（QR 已產生），無法領取' }
    if (gift.order.activatedAt)      return { ok: false, reason: '此 eSIM 已被原買家激活，無法領取' }

    // 原子更新 gift
    const claim = await tx.orderGift.updateMany({
      where: { id: gift.id, claimedAt: null, cancelledAt: null },
      data:  { toUserId: recipientId, claimedAt: new Date() },
    })
    if (claim.count === 0) return { ok: false, reason: '此分享已被他人領取' }

    // 轉移擁有權
    await tx.order.update({
      where: { id: gift.orderId },
      data:  { currentOwnerId: recipientId },
    })

    // 取訂單第一個商品名作為通知文案
    const item = await tx.orderItem.findFirst({
      where: { orderId: gift.orderId },
      select: { productName: true },
    })
    const recipientUser = await tx.user.findUnique({
      where: { id: recipientId },
      select: { displayName: true },
    })

    // 通知 sender（best effort，不阻塞 transaction commit）
    notifyGiftClaimed(
      gift.fromUserId,
      recipientUser?.displayName ?? '對方',
      item?.productName ?? 'eSIM',
      gift.order.user?.tenantAdminId ?? null,
    ).catch(() => {})

    return { ok: true, orderId: gift.orderId }
  })
}

// ─── Cron：自動取消過期未領取的 gift ─────────────────────────────

export async function cancelExpiredGifts(): Promise<number> {
  const now = new Date()
  const result = await prisma.orderGift.updateMany({
    where: {
      claimedAt: null,
      cancelledAt: null,
      expiresAt: { lt: now },
    },
    data: { cancelledAt: now, cancelReason: 'expired' },
  })
  return result.count
}
