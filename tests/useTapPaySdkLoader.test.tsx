import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useTapPaySdkLoader,
  TAPPAY_SDK_SRC,
  TAPPAY_SDK_INTEGRITY,
} from '@/hooks/useTapPaySdkLoader'

function clearSdk() {
  delete (window as unknown as { TPDirect?: unknown }).TPDirect
  document.querySelectorAll('script[data-tappay-sdk]').forEach(s => s.remove())
}

describe('useTapPaySdkLoader', () => {
  beforeEach(() => { clearSdk() })
  afterEach(() => { clearSdk() })

  it('appends the SDK script to document.head with correct src + integrity + crossorigin', () => {
    renderHook(() => useTapPaySdkLoader({ pollIntervalMs: 10 }))
    const script = document.querySelector<HTMLScriptElement>('script[data-tappay-sdk="1"]')
    expect(script).not.toBeNull()
    expect(script?.src).toBe(TAPPAY_SDK_SRC)
    expect(script?.async).toBe(true)
    expect(script?.integrity).toBe(TAPPAY_SDK_INTEGRITY)
    expect(script?.crossOrigin).toBe('anonymous')
  })

  it('uses a valid TapPay CDN path (regression: not the bogus /tappay.js that returns 403)', () => {
    // 必須是 /sdk/tpdirect/v<x.y.z> 結構，不能是 /tappay.js 或其他短路徑
    expect(TAPPAY_SDK_SRC).toMatch(/^https:\/\/js\.tappaysdk\.com\/sdk\/tpdirect\/v\d+\.\d+\.\d+$/)
  })

  it('does not double-inject when remounted', () => {
    const { unmount } = renderHook(() => useTapPaySdkLoader({ pollIntervalMs: 10 }))
    unmount()
    renderHook(() => useTapPaySdkLoader({ pollIntervalMs: 10 }))
    expect(document.querySelectorAll('script[data-tappay-sdk="1"]')).toHaveLength(1)
  })

  it('returns true immediately when window.TPDirect is already defined', () => {
    ;(window as unknown as { TPDirect: object }).TPDirect = {}
    const { result } = renderHook(() => useTapPaySdkLoader({ pollIntervalMs: 10 }))
    expect(result.current).toBe(true)
    // 已 ready 就不該再注入 script
    expect(document.querySelector('script[data-tappay-sdk="1"]')).toBeNull()
  })

  it('flips to true via polling once window.TPDirect appears (simulates onload-miss in LINE webview)', async () => {
    const { result } = renderHook(() => useTapPaySdkLoader({ pollIntervalMs: 10 }))
    expect(result.current).toBe(false)

    // 模擬 LINE webview 環境：腳本載完但 onLoad 沒觸發 → 輪詢需要自己抓到
    ;(window as unknown as { TPDirect: object }).TPDirect = {}
    await waitFor(() => expect(result.current).toBe(true), { timeout: 500, interval: 10 })
  })
})
