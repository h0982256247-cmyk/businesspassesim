'use client'

import { useEffect, useState } from 'react'

// TapPay SDK 載入策略：
// - LINE webview 內 next/script 的 onLoad/onReady 常被吃掉，故改 imperative 注入
// - 用 dataset 標記避免同一頁面重複 append
// - 仍保留輪詢，作為 onload 漏觸發的備援
// - 用 SRI integrity + crossorigin 防止中間人或 CDN 被串改
// - onerror 把載入失敗印到 console（不顯式報錯給使用者，但 LIFF debug 看得到）
//
// 回傳 `sdkLoaded`：window.TPDirect 已就緒。
//
// 抽成 hook 是為了讓邏輯可在 jsdom 下被測試（檢查 head 是否多了 script、
// polling 偵測到 TPDirect 後狀態翻成 true）。
//
// 注意 URL：必須是 https://js.tappaysdk.com/sdk/tpdirect/v<version>，舊版專案
// 看到的 https://js.tappaysdk.com/tappay.js 是無效路徑（403），SDK 從不會載入。

export const TAPPAY_SDK_VERSION = 'v5.25.0'
export const TAPPAY_SDK_SRC = `https://js.tappaysdk.com/sdk/tpdirect/${TAPPAY_SDK_VERSION}`
export const TAPPAY_SDK_INTEGRITY = 'sha256-WwF2exxNABEFOnxgGlHUdXHAM49O/UbVK0xDAZhrxbM='

export interface UseTapPaySdkLoaderOptions {
  /** poll 頻率（ms）。預設 300。測試時可調小加速。 */
  pollIntervalMs?: number
}

export function useTapPaySdkLoader(options: UseTapPaySdkLoaderOptions = {}): boolean {
  const { pollIntervalMs = 300 } = options
  const [sdkLoaded, setSdkLoaded] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // 已有就直接 ready
    if ((window as unknown as { TPDirect?: unknown }).TPDirect) {
      setSdkLoaded(true)
      return
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-tappay-sdk="1"]')
    if (!script) {
      script = document.createElement('script')
      script.src = TAPPAY_SDK_SRC
      script.async = true
      script.integrity = TAPPAY_SDK_INTEGRITY
      script.crossOrigin = 'anonymous'
      script.dataset.tappaySdk = '1'
      script.onload = () => {
        if ((window as unknown as { TPDirect?: unknown }).TPDirect) setSdkLoaded(true)
      }
      script.onerror = () => {
        // SDK 載入失敗（網路、CSP、SRI 不符等）— 下次 debug 在 LIFF / Safari Remote
        // Inspector 看得到，比靜默卡 spinner 好排查。
        console.error('[TapPay] SDK failed to load:', TAPPAY_SDK_SRC)
      }
      document.head.appendChild(script)
    }

    const t = setInterval(() => {
      if ((window as unknown as { TPDirect?: unknown }).TPDirect) {
        setSdkLoaded(true)
        clearInterval(t)
      }
    }, pollIntervalMs)
    return () => clearInterval(t)
  }, [pollIntervalMs])

  return sdkLoaded
}
