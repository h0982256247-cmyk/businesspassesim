import { prisma } from '@/lib/db/prisma'
import { GroupStatus } from '@prisma/client'
import { issueCoupon, getCouponLevel } from './coupon'
import { notifyGroupApproved, notifyGroupRejected } from './notification'
import { safeDecrypt } from '@/lib/utils/crypto'
import { randomBytes } from 'crypto'

// ─── 申請社群主 ───────────────────────────────────────────────────

export interface ApplyGroupInput {
  userId: string
  name: string
  description?: string
  type?: string
  tenantAdminId?: string
}

export async function applyGroup(input: ApplyGroupInput) {
  const existing = await prisma.group.findUnique({ where: { ownerId: input.userId } })
  if (existing) throw new Error('已有社群，不可重複申請')

  return prisma.group.create({
    data: {
      ownerId: input.userId,
      name: input.name,
      description: input.description,
      type: input.type,
      status: GroupStatus.PENDING,
      rebateRate: 0.20,   // 預設讓利 20% → 會員回購券 8 折；社群主之後可在設定調整(0~30%)
      inviteCode: randomBytes(4).toString('hex').toUpperCase(),
      tenantAdminId: input.tenantAdminId ?? null,
    },
  })
}

// 後台一鍵升級：跳過自助申請與審核兩步，直接從會員建出 APPROVED 狀態
// 的社群、並 fan-out 跟 approveGroup 一樣的副作用（發 GROUP_OWNER 7 折券、
// 推 LINE 通知）。
//
// 拋錯：
//   - 該 user 已有社群（任何 status）→ 不可重複；先到 /platform/groups
//     處理現有那筆
//   - user 不存在 → 拋
export interface PromoteUserToOwnerInput {
  userId: string
  name: string
  description?: string
  tenantAdminId?: string | null   // 給 SUPER_ADMIN 用；PLATFORM_ADMIN 走自己的
}
export async function promoteUserToOwner(input: PromoteUserToOwnerInput) {
  const existing = await prisma.group.findUnique({ where: { ownerId: input.userId } })
  if (existing) throw new Error('該會員已擁有社群，無法重複升級')

  const owner = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, lineUid: true },
  })
  if (!owner) throw new Error('會員不存在')

  // 升級前先離開原社群（若仍是別人社群的有效成員）：標記離開 + 作廢該社群發出、尚未
  // 使用的券（比照 leaveGroup）。否則新社群主會同時持有別社群入群券，身份與分潤歸屬
  // （券的 sourceGroupId 決定）皆錯亂。
  const membership = await prisma.groupMember.findUnique({
    where: { userId: input.userId },
    select: { groupId: true, leftAt: true },
  })
  if (membership && !membership.leftAt) {
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.groupMember.update({
        where: { userId: input.userId },
        data: { leftAt: now },
      })
      await tx.coupon.updateMany({
        where: {
          ownerId: input.userId,
          sourceGroupId: membership.groupId,
          usedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { expiresAt: now },
      })
    })
  }

  const group = await prisma.group.create({
    data: {
      ownerId: input.userId,
      name: input.name,
      description: input.description,
      status: GroupStatus.APPROVED,
      approvedAt: new Date(),
      rebateRate: 0.20,   // 預設讓利 20% → 會員回購券 8 折；社群主之後可在設定調整(0~30%)
      inviteCode: randomBytes(4).toString('hex').toUpperCase(),
      tenantAdminId: input.tenantAdminId ?? null,
    },
    select: { id: true, name: true, tenantAdminId: true, inviteCode: true },
  })

  // 與 approveGroup 一致：發 7 折 GROUP_OWNER 券、推 LINE 通知
  await issueCoupon({
    ownerId: owner.id,
    ownerUid: owner.lineUid,
    type: 'GROUP_OWNER',
    discount: 0.7,
    isOfficial: false,
    sourceGroupId: group.id,
  })
  notifyGroupApproved(owner.id, group.name, group.tenantAdminId).catch(() => {})

  return group
}

// ─── 加入社群 ─────────────────────────────────────────────────────

export type JoinGroupResult =
  | { ok: true; groupName: string; couponDiscount: number | null }
  | { ok: false; reason: string }

export async function joinGroup(userId: string, lineUid: string, inviteCode: string): Promise<JoinGroupResult> {
  const group = await prisma.group.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, status: true, ownerId: true, rebateRate: true },
  })

  if (!group) return { ok: false, reason: '邀請碼無效' }
  if (group.status !== GroupStatus.APPROVED) return { ok: false, reason: '此社群尚未核准' }
  if (group.ownerId === userId) return { ok: false, reason: '社群主不能加入自己的社群' }

  const existing = await prisma.groupMember.findUnique({ where: { userId } })
  if (existing) return { ok: false, reason: '已屬於其他社群，如需換群請聯絡客服' }

  // 入群券折扣 = 1 − 社群當下讓利比例（snapshot；之後社群主調整不影響已發出的券）
  //   rebateRate 0%   → 不發券（無折扣可給）
  //   rebateRate 10%  → 90 折
  //   rebateRate 30%  → 70 折
  const rebateRate = Number(group.rebateRate)
  const couponDiscount = Math.round((1 - rebateRate) * 100) / 100
  const shouldIssueCoupon = rebateRate > 0

  await prisma.$transaction(async tx => {
    await tx.groupMember.create({
      data: { groupId: group.id, userId },
    })

    if (shouldIssueCoupon) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, lineUid: true } })
      if (user) {
        await tx.coupon.create({
          data: {
            ownerId: user.id,
            ownerUid: user.lineUid,
            type: 'GROUP_JOIN',
            level: getCouponLevel(couponDiscount),
            discount: couponDiscount,
            isOfficial: false,
            sourceGroupId: group.id,
            expiresAt: null, // 入群券無使用期限
          },
        })
      }
    }
  })

  return { ok: true, groupName: group.name, couponDiscount: shouldIssueCoupon ? couponDiscount : null }
}

// ─── 退出社群 ─────────────────────────────────────────────────────

export type LeaveGroupResult =
  | { ok: true; groupName: string; expiredCoupons: number }
  | { ok: false; reason: string }

export async function leaveGroup(userId: string): Promise<LeaveGroupResult> {
  const membership = await prisma.groupMember.findUnique({
    where: { userId },
    include: { group: { select: { id: true, name: true, ownerId: true } } },
  })

  if (!membership || membership.leftAt) return { ok: false, reason: '尚未加入任何社群' }

  // 社群主不能退出自己的社群（會破壞分潤歸屬）
  if (membership.group.ownerId === userId) {
    return { ok: false, reason: '社群主無法退出自己的社群，請先停權社群' }
  }

  const now = new Date()
  let expiredCoupons = 0

  await prisma.$transaction(async tx => {
    await tx.groupMember.update({
      where: { userId },
      data: { leftAt: now },
    })

    // 將該社群發出且仍未使用的券全部設為立即過期
    // 注意：已使用 (usedAt 非 null) 的券不動，保留歷史
    const r = await tx.coupon.updateMany({
      where: {
        ownerId: userId,
        sourceGroupId: membership.group.id,
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { expiresAt: now },
    })
    expiredCoupons = r.count
  })

  return { ok: true, groupName: membership.group.name, expiredCoupons }
}

// ─── 讓利比例上限（受 maxRebateRate 限制）─────────────────────────

// 讓利比例上限 = 該租戶的 maxRebateRate（未綁租戶時 fallback 30%）。
// 平台後台設定與社群主自助調整共用同一上限來源。
export async function getRebateCeiling(tenantAdminId: string | null): Promise<number> {
  if (!tenantAdminId) return 0.30
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: tenantAdminId },
    select: { maxRebateRate: true },
  })
  return admin ? Number(admin.maxRebateRate) : 0.30
}

export async function adminSetRebateRate(
  groupId: string,
  rebateRate: number,
  tenantAdminId: string | null,
) {
  // 租戶隔離：非平台級（tenantAdminId 非 null）只能改自己租戶的社群。
  // 少了這層，A 租戶管理員可改 B 租戶社群的讓利率，影響其分潤。比照 approve/suspend/reject。
  if (tenantAdminId != null) {
    const existing = await prisma.group.findUnique({ where: { id: groupId }, select: { tenantAdminId: true } })
    if (!existing || existing.tenantAdminId !== tenantAdminId) throw new Error('無權操作此社群')
  }

  const ceiling = await getRebateCeiling(tenantAdminId)

  if (rebateRate < 0 || rebateRate > ceiling) {
    throw new Error(`讓利比例不可超過上限 ${(ceiling * 100).toFixed(0)}%`)
  }

  return prisma.group.update({
    where: { id: groupId },
    data: { rebateRate },
  })
}

// 平台設定某社群「每月活動券上限」。立即生效（同時把本月剩餘設為新上限），
// 之後每月 1 號 settle-monthly 會再把剩餘重設為此上限。
export async function adminSetMonthlyCouponQuota(
  groupId: string,
  quota: number,
  tenantAdminId: string | null,
) {
  if (!Number.isInteger(quota) || quota < 0 || quota > 100) {
    throw new Error('每月發券上限須為 0~100 的整數')
  }
  // 租戶隔離：非平台級只能改自己租戶的社群（比照 adminSetRebateRate）。
  if (tenantAdminId != null) {
    const existing = await prisma.group.findUnique({ where: { id: groupId }, select: { tenantAdminId: true } })
    if (!existing || existing.tenantAdminId !== tenantAdminId) throw new Error('無權操作此社群')
  }
  return prisma.group.update({
    where: { id: groupId },
    data: { monthlyCouponQuota: quota, activityCouponQuota: quota },
  })
}

// ─── 社群主後台：發送活動券 ───────────────────────────────────────

export async function issueActivityCoupon(
  groupId: string,
  ownerId: string,
  targetUserIds: string[],
  discount: number,
  expiresAt?: Date
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, ownerId },
    select: { id: true, activityCouponQuota: true, status: true },
  })

  if (!group || group.status !== GroupStatus.APPROVED) throw new Error('無效的社群')
  if (group.activityCouponQuota <= 0) throw new Error('本月活動券發送次數已用完')
  if (discount < 0.8 || discount >= 1) throw new Error('活動券折扣須介於 0.80 ~ 0.99')

  const users = await prisma.user.findMany({
    where: { id: { in: targetUserIds } },
    select: { id: true, lineUid: true },
  })

  await prisma.$transaction(async tx => {
    await tx.coupon.createMany({
      data: users.map(u => ({
        ownerId: u.id,
        ownerUid: u.lineUid,
        type: 'GROUP_ACTIVITY' as const,
        level: 'C' as const,
        discount,
        isOfficial: false,
        sourceGroupId: groupId,
        expiresAt: expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })),
    })

    // 扣除配額
    await tx.group.update({
      where: { id: groupId },
      data: { activityCouponQuota: { decrement: 1 } },
    })
  })
}

// ─── 查詢 ─────────────────────────────────────────────────────────

export async function getGroupByOwnerId(ownerId: string) {
  const group = await prisma.group.findUnique({
    where: { ownerId },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true, createdAt: true } } },
        orderBy: { joinedAt: 'desc' },
      },
    },
  })
  if (!group) return null
  // 銀行帳號為機密：社群主本人在 LIFF 也只看遮罩（僅平台商後台可見完整帳號，供撥款）。
  // 分行/戶名非「帳號」，解密回傳供本人確認。bankName 為公開資訊不加密。
  const fullAccount = group.bankAccount ? safeDecrypt(group.bankAccount) : null
  // 讓利上限（跟租戶 maxRebateRate 走）：供設定頁滑桿上限用。
  const rebateCeiling = await getRebateCeiling(group.tenantAdminId)
  return {
    ...group,
    rebateCeiling,
    bankAccount:    fullAccount ? maskBankAccount(fullAccount) : null,
    bankAccountSet: !!fullAccount,   // 前端用：已設定就顯示遮罩、不覆寫
    bankBranch:     group.bankBranch     ? safeDecrypt(group.bankBranch)     : null,
    bankHolderName: group.bankHolderName ? safeDecrypt(group.bankHolderName) : null,
  }
}

// 銀行帳號遮罩：只露末 4 碼，例如 ••••6789。用於回傳給社群主本人。
function maskBankAccount(acc: string): string {
  const tail = acc.slice(-4)
  return `••••${tail}`
}

export async function getGroupByInviteCode(inviteCode: string) {
  return prisma.group.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, description: true, type: true, status: true },
  })
}

export async function getUserGroup(userId: string) {
  return prisma.groupMember.findUnique({
    where: { userId },
    include: { group: { select: { id: true, name: true, description: true, inviteCode: true, rebateRate: true } } },
  })
}

// ─── Admin：審核社群申請 ──────────────────────────────────────────

export async function approveGroup(groupId: string, tenantAdminId?: string | null) {
  if (tenantAdminId != null) {
    const existing = await prisma.group.findUnique({ where: { id: groupId }, select: { tenantAdminId: true } })
    if (!existing || existing.tenantAdminId !== tenantAdminId) throw new Error('無權操作此社群')
  }

  const group = await prisma.group.update({
    where: { id: groupId },
    data: { status: GroupStatus.APPROVED, approvedAt: new Date() },
    select: {
      id: true,
      name: true,
      tenantAdminId: true,
      owner: { select: { id: true, lineUid: true } },
    },
  })

  // 發社群主 7 折券（A 級，永久有效）
  await issueCoupon({
    ownerId: group.owner.id,
    ownerUid: group.owner.lineUid,
    type: 'GROUP_OWNER',
    discount: 0.7,
    isOfficial: false,
    sourceGroupId: group.id,
  })

  notifyGroupApproved(group.owner.id, group.name, group.tenantAdminId).catch(() => {})
  return group
}

// ─── Admin：停權社群 ──────────────────────────────────────────────

// 停權後：
//   1. group.status = SUSPENDED
//   2. 該社群相關的所有未使用券（GROUP_OWNER / GROUP_JOIN / GROUP_REPURCHASE / GROUP_ACTIVITY）
//      立即作廢，避免社群主自用 7 折券或成員繼續享受優惠
export async function suspendGroup(
  groupId: string,
  tenantAdminId?: string | null,
  // note 暫未持久化（schema 沒有 statusNote 欄位），保留參數待之後擴充
  _note?: string,
): Promise<{ voidedCoupons: number }> {
  if (tenantAdminId != null) {
    const existing = await prisma.group.findUnique({ where: { id: groupId }, select: { tenantAdminId: true } })
    if (!existing || existing.tenantAdminId !== tenantAdminId) throw new Error('無權操作此社群')
  }

  const now = new Date()

  return prisma.$transaction(async tx => {
    await tx.group.update({
      where: { id: groupId },
      data: { status: GroupStatus.SUSPENDED },
    })

    const result = await tx.coupon.updateMany({
      where: {
        sourceGroupId: groupId,
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { expiresAt: now },
    })

    return { voidedCoupons: result.count }
  })
}

export async function rejectGroup(groupId: string, note?: string, tenantAdminId?: string | null) {
  if (tenantAdminId != null) {
    const existing = await prisma.group.findUnique({ where: { id: groupId }, select: { tenantAdminId: true } })
    if (!existing || existing.tenantAdminId !== tenantAdminId) throw new Error('無權操作此社群')
  }

  const group = await prisma.group.update({
    where: { id: groupId },
    data: { status: GroupStatus.REJECTED },
    select: {
      id: true,
      name: true,
      tenantAdminId: true,
      owner: { select: { id: true } },
    },
  })
  notifyGroupRejected(group.owner.id, group.name, group.tenantAdminId).catch(() => {})
  return group
}

export async function getAllGroups(status?: GroupStatus, tenantAdminId?: string | null) {
  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (tenantAdminId !== undefined && tenantAdminId !== null) where.tenantAdminId = tenantAdminId

  return prisma.group.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { displayName: true, lineUid: true } },
      tenantAdmin: { select: { name: true, brandName: true } },
      _count: { select: { members: { where: { leftAt: null } } } },
    },
  })
}
