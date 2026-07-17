import { describe, it, expect, vi } from 'vitest'

// build3dsBlock 是內部 helper，從 tappay service 拉出來測。
// 但 tappay service 在 import 時會 throw（沒設 TAPPAY_PARTNER_KEY），
// 透過 mock 把那段 throw 旁路掉。
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { build3dsBlock } from '@/lib/services/tappay'

describe('build3dsBlock — TapPay Pay by Prime 3DS body 結構', () => {
  const RESULT_URL = {
    frontendRedirectUrl: 'https://example.com/orders/abc',
    backendNotifyUrl: 'https://example.com/api/payment/tappay/notify',
  }

  it('returns three_domain_secure as a TOP-LEVEL boolean true', () => {
    const block = build3dsBlock(RESULT_URL)
    // 關鍵：必須是 boolean true，不可包成 object（過去用 {enabled, result_url} 是錯的）
    expect(block).toHaveProperty('three_domain_secure', true)
    expect(typeof block.three_domain_secure).toBe('boolean')
  })

  it('returns result_url at TOP level (not nested inside three_domain_secure)', () => {
    const block = build3dsBlock(RESULT_URL)
    expect(block).toHaveProperty('result_url')
    expect(block.result_url).toEqual({
      frontend_redirect_url: RESULT_URL.frontendRedirectUrl,
      backend_notify_url: RESULT_URL.backendNotifyUrl,
    })
  })

  it('regression: three_domain_secure must NOT be an object (TapPay rejects with code 5: Wrong JSON format)', () => {
    const block = build3dsBlock(RESULT_URL)
    // 用 typeof 與 truthy 兩條防線：boolean true 必須通過、{enabled: true} 必須擋下
    expect(typeof block.three_domain_secure).not.toBe('object')
    expect(block.three_domain_secure).toBe(true)
  })

  it('regression: result_url must NOT be nested under three_domain_secure', () => {
    const block = build3dsBlock(RESULT_URL) as Record<string, unknown>
    // 不能變成 { three_domain_secure: { result_url: ... } }
    expect((block.three_domain_secure as unknown as { result_url?: unknown })?.result_url)
      .toBeUndefined()
  })

  it('returns empty object (no 3DS block) when resultUrl is undefined', () => {
    expect(build3dsBlock(undefined)).toEqual({})
  })

  it('merged into request body as siblings — three_domain_secure and result_url are top-level', () => {
    const body = {
      prime: 'p',
      partner_key: 'k',
      merchant_id: 'm',
      amount: 100,
      currency: 'TWD',
      ...build3dsBlock(RESULT_URL),
    }
    expect(body.three_domain_secure).toBe(true)
    expect(body.result_url).toBeDefined()
  })
})
