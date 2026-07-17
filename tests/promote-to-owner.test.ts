import { describe, it, expect, vi, beforeEach } from 'vitest'

// 修復回歸：把「別人社群的成員」升級為社群主時，必須先比照 leaveGroup 處理原社群——
// 標記離開（groupMember.leftAt）+ 作廢原社群發出的未使用券——否則新社群主會同時持有
// 別社群入群券，身份與分潤歸屬（券的 sourceGroupId 決定）皆錯亂。
const { tx } = vi.hoisted(() => ({
  tx: { groupMember: { update: vi.fn() }, coupon: { updateMany: vi.fn() } },
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    group: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    groupMember: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
}))
vi.mock('@/lib/services/coupon', () => ({ issueCoupon: vi.fn(), getCouponLevel: vi.fn(() => 'A') }))
vi.mock('@/lib/services/notification', () => ({
  notifyGroupApproved: vi.fn(() => Promise.resolve()),
  notifyGroupRejected: vi.fn(() => Promise.resolve()),
}))

import { promoteUserToOwner } from '@/lib/services/group'
import { prisma } from '@/lib/db/prisma'
import { issueCoupon } from '@/lib/services/coupon'

const setup = (membership: unknown) => {
  vi.mocked(prisma.group.findUnique).mockResolvedValue(null as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', lineUid: 'U1' } as never)
  vi.mocked(prisma.groupMember.findUnique).mockResolvedValue(membership as never)
  vi.mocked(prisma.group.create).mockResolvedValue({ id: 'gB', name: 'B', tenantAdminId: null, inviteCode: 'X' } as never)
}

describe('promoteUserToOwner — 升級社群主時清理原社群', () => {
  beforeEach(() => vi.clearAllMocks())

  it('原本是別社群有效成員 → 標記離開 + 作廢原社群未使用券，並仍發群主券', async () => {
    setup({ groupId: 'gA', leftAt: null })
    await promoteUserToOwner({ userId: 'u1', name: 'B' })

    expect(tx.groupMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, data: expect.objectContaining({ leftAt: expect.any(Date) }) }),
    )
    expect(tx.coupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ownerId: 'u1', sourceGroupId: 'gA', usedAt: null }),
        data: expect.objectContaining({ expiresAt: expect.any(Date) }),
      }),
    )
    expect(issueCoupon).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROUP_OWNER', discount: 0.7 }))
  })

  it('原本不在任何社群 → 不做離群處理，但照常發群主券', async () => {
    setup(null)
    await promoteUserToOwner({ userId: 'u1', name: 'B' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(issueCoupon).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROUP_OWNER' }))
  })

  it('原本已離開社群（leftAt 非 null）→ 不重複處理', async () => {
    setup({ groupId: 'gA', leftAt: new Date() })
    await promoteUserToOwner({ userId: 'u1', name: 'B' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
