import { prisma } from '@/lib/db/prisma'
import { MemberStatus } from '@prisma/client'
import { notifyMemberApproved, notifyMemberRejected } from './notification'
import { randomBytes } from 'crypto'

// 企業（沿用 Group model）。單一品牌 B2B2C：企業由 Super Admin 後台建立並產生邀請碼，
// 員工在 LIFF 輸入邀請碼送出加入申請（PENDING），企業管理員在後台審核（APPROVED/REJECTED）。
// 核准的成員購買 eSIM 享福利價（見 isApprovedMember）。一人只能屬於一個企業。

function genInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase() // 8 碼 hex
}

// ─── 企業建立 / 管理（Super Admin 後台）──────────────────────────

export interface CreateCompanyInput {
  name: string
  description?: string
}

export async function createCompany(input: CreateCompanyInput) {
  // 邀請碼唯一；碰撞機率極低，仍重試幾次以防萬一
  for (let i = 0; i < 5; i++) {
    const inviteCode = genInviteCode()
    const exists = await prisma.group.findUnique({ where: { inviteCode }, select: { id: true } })
    if (exists) continue
    return prisma.group.create({
      data: { name: input.name, description: input.description, inviteCode },
    })
  }
  throw new Error('產生邀請碼失敗，請重試')
}

export async function getAllCompanies() {
  return prisma.group.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { members: { where: { status: MemberStatus.APPROVED, leftAt: null } } } },
    },
  })
}

export async function getCompanyById(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: {
      _count: { select: { members: { where: { leftAt: null } } } },
    },
  })
}

export async function setCompanyActive(groupId: string, isActive: boolean) {
  return prisma.group.update({ where: { id: groupId }, data: { isActive } })
}

// 重新產生邀請碼（舊碼外流時用）
export async function regenerateInviteCode(groupId: string) {
  for (let i = 0; i < 5; i++) {
    const inviteCode = genInviteCode()
    const exists = await prisma.group.findFirst({
      where: { inviteCode, NOT: { id: groupId } },
      select: { id: true },
    })
    if (exists) continue
    return prisma.group.update({ where: { id: groupId }, data: { inviteCode } })
  }
  throw new Error('產生邀請碼失敗，請重試')
}

// ─── 員工加入企業（LIFF 輸入邀請碼）──────────────────────────────

export type JoinResult =
  | { ok: true; companyName: string; status: 'PENDING' }
  | { ok: false; reason: string }

export async function joinByInviteCode(userId: string, inviteCode: string): Promise<JoinResult> {
  const group = await prisma.group.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, isActive: true },
  })
  if (!group) return { ok: false, reason: '邀請碼無效' }
  if (!group.isActive) return { ok: false, reason: '此企業已停用' }

  const existing = await prisma.groupMember.findUnique({
    where: { userId },
    select: { groupId: true, status: true, leftAt: true },
  })

  // 一人一企業：仍在某企業（未離開）不可再加入
  if (existing && !existing.leftAt) {
    if (existing.groupId === group.id) {
      return {
        ok: false,
        reason: existing.status === MemberStatus.PENDING ? '你的加入申請審核中' : '你已是此企業成員',
      }
    }
    return { ok: false, reason: '你已屬於其他企業，如需更換請先退出' }
  }

  // 曾離開 / 曾被拒 → 重新申請：同一列重置為 PENDING 並指向新企業（GroupMember.userId 唯一）
  if (existing) {
    await prisma.groupMember.update({
      where: { userId },
      data: {
        groupId: group.id,
        status: MemberStatus.PENDING,
        joinedAt: new Date(),
        reviewedAt: null,
        reviewedById: null,
        leftAt: null,
      },
    })
  } else {
    await prisma.groupMember.create({
      data: { groupId: group.id, userId, status: MemberStatus.PENDING },
    })
  }

  return { ok: true, companyName: group.name, status: 'PENDING' }
}

export async function leaveCompany(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const membership = await prisma.groupMember.findUnique({
    where: { userId },
    select: { leftAt: true },
  })
  if (!membership || membership.leftAt) return { ok: false, reason: '尚未加入任何企業' }
  await prisma.groupMember.update({ where: { userId }, data: { leftAt: new Date() } })
  return { ok: true }
}

// ─── 企業管理員：審核成員 ────────────────────────────────────────

export async function getCompanyMembers(groupId: string, status?: MemberStatus) {
  return prisma.groupMember.findMany({
    where: { groupId, leftAt: null, ...(status ? { status } : {}) },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true, createdAt: true } } },
    orderBy: { joinedAt: 'desc' },
  })
}

// 驗證 actingUserId 是 targetUser 所屬企業的管理員（Group.adminUserId）。
// 企業管理員在 LIFF 操作，用 LIFF session 的 userId 當 actingUserId。
async function assertCompanyAdmin(actingUserId: string, targetUserId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { userId: targetUserId },
    select: { groupId: true, leftAt: true, group: { select: { name: true, adminUserId: true } } },
  })
  if (!membership || membership.leftAt) throw new Error('找不到此成員')
  if (membership.group.adminUserId !== actingUserId) throw new Error('無權操作此成員')
  return membership
}

async function reviewMember(actingUserId: string, targetUserId: string, approve: boolean) {
  const membership = await assertCompanyAdmin(actingUserId, targetUserId)

  const updated = await prisma.groupMember.update({
    where: { userId: targetUserId },
    data: {
      status: approve ? MemberStatus.APPROVED : MemberStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedById: actingUserId,
    },
  })

  const companyName = membership.group.name
  if (approve) notifyMemberApproved(targetUserId, companyName).catch(() => {})
  else notifyMemberRejected(targetUserId, companyName).catch(() => {})

  return updated
}

export async function approveMember(actingUserId: string, targetUserId: string) {
  return reviewMember(actingUserId, targetUserId, true)
}

export async function rejectMember(actingUserId: string, targetUserId: string) {
  return reviewMember(actingUserId, targetUserId, false)
}

// 移除成員（企業管理員）：標記離開，該員恢復成一般會員（看一般售價）
export async function removeMember(actingUserId: string, targetUserId: string) {
  await assertCompanyAdmin(actingUserId, targetUserId)
  return prisma.groupMember.update({ where: { userId: targetUserId }, data: { leftAt: new Date() } })
}

// LIFF company-admin 頁：取某 LINE User 管理的企業 + 成員清單（PENDING 在前）
export async function getManagedCompany(actingUserId: string) {
  const company = await prisma.group.findUnique({
    where: { adminUserId: actingUserId },
    select: { id: true, name: true, description: true, inviteCode: true, isActive: true },
  })
  if (!company) return null
  const members = await prisma.groupMember.findMany({
    where: { groupId: company.id, leftAt: null },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true, createdAt: true } } },
    orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
  })
  return { company, members }
}

// Super Admin 後台：指派 / 變更企業管理員（傳 LINE User id；null 為取消指派）
export async function setCompanyAdmin(groupId: string, adminUserId: string | null) {
  return prisma.group.update({ where: { id: groupId }, data: { adminUserId } })
}

// ─── 查詢 ────────────────────────────────────────────────────────

export async function getUserMembership(userId: string) {
  return prisma.groupMember.findUnique({
    where: { userId },
    include: { group: { select: { id: true, name: true, description: true, isActive: true } } },
  })
}

export async function getCompanyByInviteCode(inviteCode: string) {
  return prisma.group.findUnique({
    where: { inviteCode },
    select: { id: true, name: true, description: true, isActive: true },
  })
}

// 取價依據（Phase 5）：是否為「已核准且企業啟用中」的企業會員。
// 是 → 享福利價（benefitPrice）；否 → 一般售價（sellPrice）。
export async function isApprovedMember(
  userId: string,
): Promise<{ isMember: boolean; groupId: string | null }> {
  const m = await prisma.groupMember.findUnique({
    where: { userId },
    select: {
      groupId: true,
      status: true,
      leftAt: true,
      group: { select: { isActive: true } },
    },
  })
  if (m && !m.leftAt && m.status === MemberStatus.APPROVED && m.group.isActive) {
    return { isMember: true, groupId: m.groupId }
  }
  return { isMember: false, groupId: null }
}
