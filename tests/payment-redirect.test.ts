import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { redirectToPaymentUrl } from '@/lib/utils/payment-redirect'

const PAYMENT_URL = 'https://prod.tappaysdk.com/line-pay/redirect/abc123'

describe('redirectToPaymentUrl', () => {
  const originalAssign = window.location.href
  let hrefAssign: string | null

  beforeEach(() => {
    hrefAssign = null
    delete (window as unknown as { TPDirect?: unknown }).TPDirect
    // 攔截 window.location.href 賦值，避免 jsdom 真的嘗試 navigation
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        get href() { return originalAssign },
        set href(v: string) { hrefAssign = v },
      },
    })
  })

  afterEach(() => {
    delete (window as unknown as { TPDirect?: unknown }).TPDirect
  })

  it('uses TPDirect.redirect when SDK is available (TapPay official path)', () => {
    const redirect = vi.fn()
    ;(window as unknown as { TPDirect: { redirect: typeof redirect } }).TPDirect = { redirect }
    redirectToPaymentUrl(PAYMENT_URL)
    expect(redirect).toHaveBeenCalledOnce()
    expect(redirect).toHaveBeenCalledWith(PAYMENT_URL)
    expect(hrefAssign).toBeNull()
  })

  it('falls back to window.location.href when TPDirect is missing', () => {
    redirectToPaymentUrl(PAYMENT_URL)
    expect(hrefAssign).toBe(PAYMENT_URL)
  })

  it('falls back to window.location.href when TPDirect lacks the redirect method', () => {
    ;(window as unknown as { TPDirect: object }).TPDirect = {}
    redirectToPaymentUrl(PAYMENT_URL)
    expect(hrefAssign).toBe(PAYMENT_URL)
  })
})
