import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductStatus } from '@prisma/client'

// 多租戶隔離回歸測試（CLAUDE.md B 段；memory: getProductById 曾漏 tenantAdminId → A 白牌
// 可拿 B 白牌的 productId 下單，售價/成本/發卡設定/分潤全錯亂，已修）。
// 鎖住：帶 tenantAdminId 時，查詢 where 必含該租戶條件；訪客（null）才不限租戶。
vi.mock('@/lib/db/prisma', () => ({ prisma: { product: { findFirst: vi.fn() } } }))

import { getProductById } from '@/lib/services/product'
import { prisma } from '@/lib/db/prisma'

const whereOf = () =>
  (vi.mocked(prisma.product.findFirst).mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined)?.where

describe('getProductById — 多租戶隔離', () => {
  beforeEach(() => vi.clearAllMocks())

  it('帶 tenantAdminId → where 必含該 tenantAdminId（A 白牌取不到 B 白牌商品）', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never)
    await getProductById('p1', 'tenant-A')
    expect(whereOf()).toMatchObject({ id: 'p1', tenantAdminId: 'tenant-A', status: ProductStatus.ACTIVE })
  })

  it('tenantAdminId=null（訪客瀏覽）→ where 不帶 tenantAdminId（不限租戶，但仍鎖 ACTIVE）', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never)
    await getProductById('p1', null)
    const w = whereOf()
    expect(w).not.toHaveProperty('tenantAdminId')
    expect(w).toMatchObject({ id: 'p1', status: ProductStatus.ACTIVE })
  })

  it('完全未帶 tenantAdminId 參數 → 同 null：不限租戶（不可意外變成跨租戶可見以外的行為）', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null as never)
    await getProductById('p1')
    expect(whereOf()).not.toHaveProperty('tenantAdminId')
  })
})
