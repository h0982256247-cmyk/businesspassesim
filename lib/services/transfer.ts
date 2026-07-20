import { prisma } from '@/lib/db/prisma'
import { randomBytes } from 'crypto'
import { getPlatformSettings } from './tenant-config'
import { OrderStatus } from '@prisma/client'

// eSIM 轉贈：買家把「已備好但未安裝」的 eSIM 分享給好友，好友領取後擁有權（currentOwnerId）轉移。
// 防呆：只有原始購買人可轉（受贈的卡不可再轉，嚴格 one-hop）、已安裝（redeemedAt/activatedAt）不可轉、領取用 claimedAt 原子鎖防重複。

const EXPIRY_DAYS = 7

function genToken(): string {
  return randomBytes(24).toString('base64url') // 32 字元、URL 安全
}

export type TransferResult = { ok: true; token: string } | { ok: false; reason: string }

// 建立（或重建）轉贈連結。回傳 token；同一訂單重複建立會沿用同一列並換新 token。
export async function createTransfer(orderId: string, fromUserId: string): Promise<TransferResult> {
  const settings = await getPlatformSettings()
  if (!settings.transferEnabled) return { ok: false, reason: '目前未開放轉贈' }

  const order = await prisma.order.findFirst({
    where: { id: orderId, currentOwnerId: fromUserId },
    select: { id: true, userId: true, status: true, esimRcode: true, redeemedAt: true, activatedAt: true },
  })
  if (!order) return { ok: false, reason: '找不到這張 eSIM 或你已不是擁有者' }
  // 受贈得來的 eSIM 不可再轉出：只有原始購買人（userId）可轉，嚴格 one-hop（與前端 isReceived 一致）
  if (order.userId !== fromUserId) {
    return { ok: false, reason: '受贈的 eSIM 無法再轉贈' }
  }
  if (order.status !== OrderStatus.COMPLETED || !order.esimRcode) {
    return { ok: false, reason: 'eSIM 尚未備妥，無法轉贈' }
  }
  if (order.redeemedAt || order.activatedAt) {
    return { ok: false, reason: '已安裝的 eSIM 無法轉贈' }
  }

  const token = genToken()
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  // 同一訂單同時只有一筆進行中轉贈（orderId @unique）；重建時換新 token、重置狀態。
  await prisma.esimTransfer.upsert({
    where: { orderId },
    create: { orderId, token, fromUserId, expiresAt },
    update: { token, fromUserId, expiresAt, toUserId: null, claimedAt: null, cancelledAt: null },
  })
  return { ok: true, token }
}

export async function cancelTransfer(orderId: string, fromUserId: string): Promise<{ ok: boolean; reason?: string }> {
  const t = await prisma.esimTransfer.findUnique({ where: { orderId }, select: { fromUserId: true, claimedAt: true } })
  if (!t || t.fromUserId !== fromUserId) return { ok: false, reason: '找不到轉贈' }
  if (t.claimedAt) return { ok: false, reason: '對方已領取，無法取消' }
  await prisma.esimTransfer.update({ where: { orderId }, data: { cancelledAt: new Date() } })
  return { ok: true }
}

// 好友開領取頁用：回傳轉贈狀態 + eSIM 概要（不含敏感 esimQrcode/rcode）。
export async function getTransferByToken(token: string) {
  const t = await prisma.esimTransfer.findUnique({
    where: { token },
    select: {
      orderId: true, fromUserId: true, toUserId: true, expiresAt: true, claimedAt: true, cancelledAt: true,
      fromUser: { select: { displayName: true } },
      order: {
        select: {
          status: true, redeemedAt: true, activatedAt: true, currentOwnerId: true,
          orderItems: { select: { productName: true, product: { select: { dataCapacity: true } } }, take: 1 },
        },
      },
    },
  })
  if (!t) return null
  const now = new Date()
  const state: 'claimable' | 'claimed' | 'cancelled' | 'expired' | 'unavailable' =
    t.cancelledAt ? 'cancelled'
    : t.claimedAt ? 'claimed'
    : t.expiresAt <= now ? 'expired'
    : (t.order.redeemedAt || t.order.activatedAt) ? 'unavailable'
    : 'claimable'
  return {
    orderId: t.orderId,
    fromUserId: t.fromUserId,
    toUserId: t.toUserId,
    fromName: t.fromUser.displayName,
    productName: t.order.orderItems[0]?.productName ?? 'eSIM',
    dataCapacity: t.order.orderItems[0]?.product?.dataCapacity ?? null,
    state,
  }
}

// 好友領取：原子鎖（claimedAt IS NULL）+ 擁有權轉移，包 transaction。
export async function claimTransfer(token: string, toUserId: string): Promise<{ ok: boolean; reason?: string }> {
  const t = await prisma.esimTransfer.findUnique({
    where: { token },
    select: { orderId: true, fromUserId: true, expiresAt: true, claimedAt: true, cancelledAt: true },
  })
  if (!t) return { ok: false, reason: '轉贈連結無效' }
  if (t.fromUserId === toUserId) return { ok: false, reason: '這是你自己送出的轉贈，無法領取' }
  if (t.cancelledAt) return { ok: false, reason: '對方已取消轉贈' }
  if (t.claimedAt) return { ok: false, reason: '這張 eSIM 已被領取' }
  if (t.expiresAt <= new Date()) return { ok: false, reason: '轉贈連結已過期' }

  try {
    await prisma.$transaction(async (tx) => {
      // 原子領取：只有 claimedAt 仍為 null 才成功（擋並發重複領取）
      const claimed = await tx.esimTransfer.updateMany({
        where: { token, claimedAt: null, cancelledAt: null },
        data: { claimedAt: new Date(), toUserId },
      })
      if (claimed.count !== 1) throw new Error('ALREADY_CLAIMED')
      // 擁有權轉移：僅在仍未安裝、且擁有者仍是原贈與人時（防呆）
      const moved = await tx.order.updateMany({
        where: { id: t.orderId, currentOwnerId: t.fromUserId, redeemedAt: null, activatedAt: null },
        data: { currentOwnerId: toUserId },
      })
      if (moved.count !== 1) throw new Error('NOT_TRANSFERABLE')
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'ALREADY_CLAIMED') return { ok: false, reason: '這張 eSIM 已被領取' }
    if (msg === 'NOT_TRANSFERABLE') return { ok: false, reason: 'eSIM 狀態已變更，無法領取' }
    throw e
  }
  return { ok: true }
}
