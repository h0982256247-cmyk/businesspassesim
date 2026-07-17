import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommissionStatus } from '@prisma/client'

// 多租戶隔離回歸（規範 I 段「Commission 跨群不可歸屬」）：Commission 無 tenantAdminId 直接欄位，
// 租戶歸屬走 group relation。白牌 admin 查待結算分潤時 where 必須帶 group.tenantAdminId、
// 只看自己租戶；SUPER_ADMIN（null）才看全平台。
vi.mock('@/lib/db/prisma', () => ({ prisma: { commission: { findMany: vi.fn() } } }))

import { getAllPendingCommissions } from '@/lib/services/commission'
import { prisma } from '@/lib/db/prisma'

const whereOf = () =>
  (vi.mocked(prisma.commission.findMany).mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined)?.where

describe('getAllPendingCommissions — 多租戶隔離', () => {
  beforeEach(() => vi.clearAllMocks())

  it('白牌 admin（tenantAdminId 有值）→ where 限自己租戶（group.tenantAdminId）', async () => {
    vi.mocked(prisma.commission.findMany).mockResolvedValue([] as never)
    await getAllPendingCommissions('tenant-A')
    expect(whereOf()).toMatchObject({ status: CommissionStatus.PENDING, group: { tenantAdminId: 'tenant-A' } })
  })

  it('SUPER_ADMIN（null）→ 不限租戶（看全平台），但仍鎖 PENDING', async () => {
    vi.mocked(prisma.commission.findMany).mockResolvedValue([] as never)
    await getAllPendingCommissions(null)
    const w = whereOf()
    expect(w).not.toHaveProperty('group')
    expect(w).toMatchObject({ status: CommissionStatus.PENDING })
  })
})
