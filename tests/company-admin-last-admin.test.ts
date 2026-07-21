import { describe, it, expect, vi, beforeEach } from 'vitest'

// 守則：企業不可掉到 0 管理員（否則沒人能在 LIFF 審核成員 → 企業凍結）。
// leaveCompany（自我退出）與 removeMember（管理員踢人）都要擋「最後一位管理員」，
// 比照 setMemberAdmin 既有守門。此測試鎖住這兩條路徑。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { groupMember: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/services/notification', () => ({
  notifyMemberApproved: vi.fn(() => Promise.resolve()),
  notifyMemberRejected: vi.fn(() => Promise.resolve()),
}))

import { leaveCompany, removeMember } from '@/lib/services/group'
import { prisma } from '@/lib/db/prisma'

const gm = () => vi.mocked(prisma.groupMember)

describe('最後一位企業管理員守門', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('leaveCompany', () => {
    it('唯一管理員退出 → 擋，不寫 leftAt', async () => {
      gm().findUnique
        .mockResolvedValueOnce({ leftAt: null, groupId: 'g1' } as never)                  // leaveCompany 查身分
        .mockResolvedValueOnce({ role: 'ADMIN', groupId: 'g1', leftAt: null } as never)   // isLastAdmin 查角色
      gm().count.mockResolvedValue(0 as never)                                             // 無其他管理員
      const r = await leaveCompany('u1')
      expect(r.ok).toBe(false)
      expect(gm().update).not.toHaveBeenCalled()
    })

    it('還有其他管理員時 → 允許退出', async () => {
      gm().findUnique
        .mockResolvedValueOnce({ leftAt: null, groupId: 'g1' } as never)
        .mockResolvedValueOnce({ role: 'ADMIN', groupId: 'g1', leftAt: null } as never)
      gm().count.mockResolvedValue(2 as never)                                             // 尚有其他管理員
      const r = await leaveCompany('u1')
      expect(r.ok).toBe(true)
      expect(gm().update).toHaveBeenCalled()
    })

    it('一般成員退出 → 允許（非 ADMIN 不受守門）', async () => {
      gm().findUnique
        .mockResolvedValueOnce({ leftAt: null, groupId: 'g1' } as never)
        .mockResolvedValueOnce({ role: 'MEMBER', groupId: 'g1', leftAt: null } as never)
      const r = await leaveCompany('u1')
      expect(r.ok).toBe(true)
      expect(gm().update).toHaveBeenCalled()
      expect(gm().count).not.toHaveBeenCalled()                                            // 非 ADMIN 提早 return，不查 count
    })
  })

  describe('removeMember', () => {
    // assertCompanyAdmin 先跑：findUnique(target membership) + findFirst(acting 是否 ADMIN)
    const mockAssertOk = () => {
      gm().findFirst.mockResolvedValue({ id: 'actingAdmin' } as never)                     // acting 是同企業 ADMIN
    }

    it('移除自己 → throw（引導改用退出企業）', async () => {
      gm().findUnique.mockResolvedValueOnce({ groupId: 'g1', leftAt: null, group: { name: 'X' } } as never)
      mockAssertOk()
      await expect(removeMember('u1', 'u1')).rejects.toThrow('不可移除自己')
      expect(gm().update).not.toHaveBeenCalled()
    })

    it('移除最後一位管理員 → throw', async () => {
      gm().findUnique
        .mockResolvedValueOnce({ groupId: 'g1', leftAt: null, group: { name: 'X' } } as never)  // assertCompanyAdmin
        .mockResolvedValueOnce({ role: 'ADMIN', groupId: 'g1', leftAt: null } as never)          // isLastAdmin
      mockAssertOk()
      gm().count.mockResolvedValue(0 as never)
      await expect(removeMember('admin1', 'targetAdmin')).rejects.toThrow('唯一的企業管理員')
      expect(gm().update).not.toHaveBeenCalled()
    })

    it('移除一般成員 → 允許', async () => {
      gm().findUnique
        .mockResolvedValueOnce({ groupId: 'g1', leftAt: null, group: { name: 'X' } } as never)  // assertCompanyAdmin
        .mockResolvedValueOnce({ role: 'MEMBER', groupId: 'g1', leftAt: null } as never)         // isLastAdmin → false
      mockAssertOk()
      gm().update.mockResolvedValue({} as never)
      await removeMember('admin1', 'member1')
      expect(gm().update).toHaveBeenCalledWith({ where: { userId: 'member1' }, data: { leftAt: expect.any(Date) } })
    })
  })
})
