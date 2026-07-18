import { describe, it, expect, vi, beforeEach } from 'vitest'

// fail-closed helper 回歸測試：getOrderForOwner 必須把 owner 條件放進 where
// （userId），漏帶或非擁有者一律查不到 → route 統一 404、不洩漏訂單存在性。
vi.mock('@/lib/db/prisma', () => ({ prisma: { order: { findFirst: vi.fn() } } }))

import { getOrderForOwner } from '@/lib/services/order'
import { prisma } from '@/lib/db/prisma'

const whereOf = () =>
  (vi.mocked(prisma.order.findFirst).mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined)?.where

describe('getOrderForOwner — fail-closed owner scope', () => {
  beforeEach(() => vi.clearAllMocks())

  it('owner 條件進 where（userId），而非事後比對', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)
    await getOrderForOwner('ord_1', 'user_A', { id: true })
    expect(whereOf()).toMatchObject({ id: 'ord_1', userId: 'user_A' })
  })

  it('查不到（非擁有者）→ 回 null（route 據此回 404）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)
    const r = await getOrderForOwner('ord_x', 'not_owner', { id: true })
    expect(r).toBeNull()
  })
})
