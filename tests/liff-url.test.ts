import { describe, it, expect } from 'vitest'
import { buildLiffOrderUrl, isAllowedReturnUrl } from '@/lib/utils/liff-url'

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

// returnUrl 會原樣交給 TapPay 當付款後的回跳網址，不設限即 open redirect
// （誘導受害者付款後導到假的「付款完成」頁釣卡號）。此測試鎖住白名單。
describe('isAllowedReturnUrl — TapPay 回跳白名單', () => {
  it('放行自家 origin', () => {
    expect(isAllowedReturnUrl(`${ORIGIN}/liff/bee/orders?paid=1`, ORIGIN)).toBe(true)
  })

  it('放行 liff.line.me 永久連結（liff.permanentLink 產出的正常值）', () => {
    expect(isAllowedReturnUrl('https://liff.line.me/2010753530-4yyBqg0J/orders?paid=1', ORIGIN)).toBe(true)
  })

  it('擋掉外部網域', () => {
    expect(isAllowedReturnUrl('https://evil.com/fake-success', ORIGIN)).toBe(false)
    expect(isAllowedReturnUrl('https://esim-eta-eight.vercel.app.evil.com/x', ORIGIN)).toBe(false)
  })

  it('擋掉用 userinfo 偽裝成白名單網域的 URL', () => {
    expect(isAllowedReturnUrl('https://liff.line.me@evil.com/x', ORIGIN)).toBe(false)
    expect(isAllowedReturnUrl('https://liff.line.me.evil.com/x', ORIGIN)).toBe(false)
  })

  it('擋掉非 http(s) scheme 與相對路徑', () => {
    expect(isAllowedReturnUrl('javascript:alert(1)', ORIGIN)).toBe(false)
    expect(isAllowedReturnUrl('/liff/bee/orders', ORIGIN)).toBe(false)
    expect(isAllowedReturnUrl('', ORIGIN)).toBe(false)
  })
})
