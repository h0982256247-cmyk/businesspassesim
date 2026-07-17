import { describe, it, expect, vi, beforeEach } from 'vitest'

// P2 fail-closed helper 回歸測試：getOrderForOwner 必須把 owner 條件放進 where
// （currentOwnerId），漏帶或非擁有者一律查不到 → route 統一 404、不洩漏訂單存在性。
// 轉贈後以現任擁有者（currentOwnerId）為準，而非原買家 userId。
vi.mock('@/lib/db/prisma', () => ({ prisma: { order: { findFirst: vi.fn() } } }))

import { getOrderForOwner, orderTenantWhere } from '@/lib/services/order'
import { prisma } from '@/lib/db/prisma'

const whereOf = () =>
  (vi.mocked(prisma.order.findFirst).mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined)?.where

describe('getOrderForOwner — fail-closed owner scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('owner 條件進 where（currentOwnerId），而非事後比對', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)
    await getOrderForOwner('ord_1', 'user_A', { id: true })
    expect(whereOf()).toMatchObject({ id: 'ord_1', currentOwnerId: 'user_A' })
  })

  it('用 currentOwnerId 而非原買家 userId（轉贈後由現任擁有者存取）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)
    await getOrderForOwner('ord_1', 'user_A', { id: true })
    const w = whereOf()
    expect(w).not.toHaveProperty('userId')
    expect(w).toHaveProperty('currentOwnerId', 'user_A')
  })

  it('查不到（非擁有者）→ 回 null（route 據此回 404）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)
    const r = await getOrderForOwner('ord_x', 'not_owner', { id: true })
    expect(r).toBeNull()
  })
})

describe('orderTenantWhere — platform 後台租戶過濾片段', () => {
  it('白牌 admin（tenantAdminId 有值）→ 限自己租戶（透過 user relation）', () => {
    expect(orderTenantWhere('tenant-A')).toEqual({ user: { tenantAdminId: 'tenant-A' } })
  })

  it('SUPER_ADMIN（tenantAdminId=null）→ 空條件（看全部）', () => {
    expect(orderTenantWhere(null)).toEqual({})
  })
})
