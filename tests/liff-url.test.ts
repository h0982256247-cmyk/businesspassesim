import { describe, it, expect } from 'vitest'
import { buildLiffOrderUrl } from '@/lib/utils/liff-url'

const ORIGIN = 'https://esim-eta-eight.vercel.app'

describe('buildLiffOrderUrl', () => {
  it('builds slug-prefixed single-order URL', () => {
    expect(buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: 'bee', orderIdOrBundleId: 'ord_123', isBundle: false,
    })).toBe('https://esim-eta-eight.vercel.app/liff/bee/orders?paid=1&oid=ord_123')
  })

  it('builds slug-prefixed bundle URL', () => {
    expect(buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: 'bee', orderIdOrBundleId: 'bnd_999', isBundle: true,
    })).toBe('https://esim-eta-eight.vercel.app/liff/bee/orders?bundleId=bnd_999&paid=1')
  })

  it('handles different slugs correctly — important for multi-tenant', () => {
    expect(buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: 'travel-co', orderIdOrBundleId: 'o1', isBundle: false,
    })).toContain('/liff/travel-co/')
    expect(buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: 'other-shop', orderIdOrBundleId: 'o1', isBundle: false,
    })).toContain('/liff/other-shop/')
  })

  it('falls back to root when slug is null (no tenant assigned)', () => {
    expect(buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: null, orderIdOrBundleId: 'ord_1', isBundle: false,
    })).toBe('https://esim-eta-eight.vercel.app/')
  })

  it('URL-encodes ids to prevent injection（id 進到 query value 仍須編碼）', () => {
    expect(buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: 'bee', orderIdOrBundleId: 'a/b?c#d', isBundle: false,
    })).toBe('https://esim-eta-eight.vercel.app/liff/bee/orders?paid=1&oid=a%2Fb%3Fc%23d')
  })

  it('regression: never produces the deleted (liff) group paths like ${origin}/orders without slug', () => {
    const r = buildLiffOrderUrl({
      origin: ORIGIN, tenantSlug: 'bee', orderIdOrBundleId: 'x', isBundle: false,
    })
    // 必須帶 /liff/<slug>/ 前綴，不能是直接 ${origin}/orders...
    expect(r).toContain('/liff/bee/orders')
    expect(r).not.toMatch(/^https:\/\/[^/]+\/orders/)  // origin 後直接接 /orders 就是舊 (liff) 群組
  })
})
