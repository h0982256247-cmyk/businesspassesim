import { describe, it, expect, vi, beforeEach } from 'vitest'

// 修復回歸：後台社群管理的成員數（getAllGroups 的 _count.members）必須過濾 leftAt，
// 只算「未離開」的成員。否則已離開、或被升級為社群主而移出原社群的舊成員仍被計入，
// 造成人數虛高（實例：Felix 升級社群主已離開 Edwin的小窩，後台卻仍顯示 3 人）。
vi.mock('@/lib/db/prisma', () => ({ prisma: { group: { findMany: vi.fn() } } }))
vi.mock('@/lib/services/coupon', () => ({ issueCoupon: vi.fn(), getCouponLevel: vi.fn() }))
vi.mock('@/lib/services/notification', () => ({
  notifyGroupApproved: vi.fn(() => Promise.resolve()),
  notifyGroupRejected: vi.fn(() => Promise.resolve()),
}))

import { getAllGroups } from '@/lib/services/group'
import { prisma } from '@/lib/db/prisma'

describe('getAllGroups — 成員數只算未離開的成員', () => {
  beforeEach(() => vi.clearAllMocks())

  it('_count.members 帶 leftAt: null 過濾（已離開者不計入）', async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValue([] as never)
    await getAllGroups()
    const arg = vi.mocked(prisma.group.findMany).mock.calls[0]?.[0] as {
      include?: { _count?: { select?: { members?: unknown } } }
    }
    expect(arg?.include?._count?.select?.members).toEqual({ where: { leftAt: null } })
  })
})
