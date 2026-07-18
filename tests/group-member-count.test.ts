import { describe, it, expect, vi, beforeEach } from 'vitest'

// 後台企業列表的成員數（getAllCompanies 的 _count.members）必須過濾：
// 只算「已核准（APPROVED）且未離開（leftAt: null）」的成員，避免待審/已離開者灌水。
vi.mock('@/lib/db/prisma', () => ({ prisma: { group: { findMany: vi.fn() } } }))
vi.mock('@/lib/services/notification', () => ({
  notifyMemberApproved: vi.fn(() => Promise.resolve()),
  notifyMemberRejected: vi.fn(() => Promise.resolve()),
}))

import { getAllCompanies } from '@/lib/services/group'
import { prisma } from '@/lib/db/prisma'

describe('getAllCompanies — 成員數只算已核准且未離開', () => {
  beforeEach(() => vi.clearAllMocks())

  it('_count.members 帶 status=APPROVED + leftAt:null 過濾', async () => {
    vi.mocked(prisma.group.findMany).mockResolvedValue([] as never)
    await getAllCompanies()
    const arg = vi.mocked(prisma.group.findMany).mock.calls[0]?.[0] as {
      include?: { _count?: { select?: { members?: unknown } } }
    }
    expect(arg?.include?._count?.select?.members).toEqual({ where: { status: 'APPROVED', leftAt: null } })
  })
})
