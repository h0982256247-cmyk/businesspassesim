import { prisma } from '@/lib/db/prisma'
import { MemberStatus, GroupMemberRole } from '@prisma/client'
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
      // 企業管理員（可多位）：以 GroupMember.role=ADMIN 為準，依加入時間排序（第一位＝最早指派）
      members: {
        where: { role: GroupMemberRole.ADMIN, leftAt: null },
        select: { user: { select: { id: true, displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      },
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

// Super Admin 後台：刪除企業。已有訂單則擋（保護財務紀錄，請改用「停權」）；
// 否則連帶刪除所有成員（GroupMember.group 為必填 FK，需先清才能刪企業）後刪企業。
export async function deleteCompany(groupId: string): Promise<{ ok: boolean; reason?: string }> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } })
  if (!group) return { ok: false, reason: '企業不存在' }

  const orderCount = await prisma.order.count({ where: { companyId: groupId } })
  if (orderCount > 0) {
    return { ok: false, reason: `此企業已有 ${orderCount} 筆訂單，不可刪除。如需停止使用請改用「停權」。` }
  }

  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { groupId } }),
    prisma.group.delete({ where: { id: groupId } }),
  ])
  return { ok: true }
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

// 判斷 userId 是否為該企業「最後一位」在籍管理員（退出/移除後企業會變 0 管理員）。
// 非在籍 ADMIN 一律回 false（移除他不影響管理員數）。與 setMemberAdmin 的守門同語意。
async function isLastAdmin(groupId: string, userId: string): Promise<boolean> {
  const member = await prisma.groupMember.findUnique({
    where: { userId },
    select: { role: true, groupId: true, leftAt: true },
  })
  if (!member || member.leftAt || member.groupId !== groupId || member.role !== GroupMemberRole.ADMIN) {
    return false
  }
  const otherAdmins = await prisma.groupMember.count({
    where: { groupId, role: GroupMemberRole.ADMIN, leftAt: null, userId: { not: userId } },
  })
  return otherAdmins === 0
}

export async function leaveCompany(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const membership = await prisma.groupMember.findUnique({
    where: { userId },
    select: { leftAt: true, groupId: true },
  })
  if (!membership || membership.leftAt) return { ok: false, reason: '尚未加入任何企業' }
  // 最後一位管理員不可退出（否則沒人能在 LIFF 審核成員 → 企業凍結）
  if (await isLastAdmin(membership.groupId, userId)) {
    return { ok: false, reason: '你是唯一的企業管理員，請先指派其他管理員後再退出' }
  }
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
    select: { groupId: true, leftAt: true, group: { select: { name: true } } },
  })
  if (!membership || membership.leftAt) throw new Error('找不到此成員')
  // acting user 必須是「同企業的 ADMIN 成員」（一企業可多位管理員）
  const actingAdmin = await prisma.groupMember.findFirst({
    where: { userId: actingUserId, groupId: membership.groupId, role: GroupMemberRole.ADMIN, leftAt: null },
    select: { id: true },
  })
  if (!actingAdmin) throw new Error('無權操作此成員')
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
  const membership = await assertCompanyAdmin(actingUserId, targetUserId)
  // 不可移除自己（自我退出改走 leaveCompany，一併受最後管理員守門）
  if (actingUserId === targetUserId) throw new Error('不可移除自己，請改用「退出企業」')
  // 不可移除最後一位管理員（否則企業沒人能審核成員）
  if (await isLastAdmin(membership.groupId, targetUserId)) {
    throw new Error('無法移除唯一的企業管理員，請先指派其他管理員')
  }
  return prisma.groupMember.update({ where: { userId: targetUserId }, data: { leftAt: new Date() } })
}

// LIFF company-admin 頁：取某 LINE User 管理的企業 + 成員清單（PENDING 在前）
export async function getManagedCompany(actingUserId: string) {
  // 找「actingUserId 是 ADMIN 成員」的企業（可多位管理員）
  const adminOf = await prisma.groupMember.findFirst({
    where: { userId: actingUserId, role: GroupMemberRole.ADMIN, leftAt: null },
    select: { group: { select: { id: true, name: true, description: true, inviteCode: true, isActive: true } } },
  })
  if (!adminOf) return null
  const company = adminOf.group
  const members = await prisma.groupMember.findMany({
    where: { groupId: company.id, leftAt: null },
    include: { user: { select: { id: true, displayName: true, avatarUrl: true, createdAt: true } } },
    orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
  })
  return { company, members }
}

// Super Admin 後台：設定 / 移除某成員的企業管理員身分（一企業可多位管理員）。
// 設為管理員時同時自動核准其成員資格（免自我審核）；移除時不可移除最後一位管理員。
export async function setMemberAdmin(
  groupId: string, userId: string, makeAdmin: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  if (makeAdmin) {
    const now = new Date()
    await prisma.groupMember.updateMany({
      where: { userId, groupId },
      data: { role: GroupMemberRole.ADMIN, status: MemberStatus.APPROVED, reviewedAt: now, leftAt: null },
    })
    return { ok: true }
  }
  // 移除管理員：至少保留一位（否則沒人能在 LIFF 審核成員）
  const adminCount = await prisma.groupMember.count({
    where: { groupId, role: GroupMemberRole.ADMIN, leftAt: null },
  })
  if (adminCount <= 1) return { ok: false, reason: '至少需保留一位管理員' }
  await prisma.groupMember.updateMany({ where: { userId, groupId }, data: { role: GroupMemberRole.MEMBER } })
  return { ok: true }
}

// ─── 查詢 ────────────────────────────────────────────────────────

export async function getUserMembership(userId: string) {
  return prisma.groupMember.findUnique({
    where: { userId },
    include: { group: { select: { id: true, name: true, description: true, isActive: true } } },
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
