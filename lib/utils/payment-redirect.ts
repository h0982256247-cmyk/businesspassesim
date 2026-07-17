// Pay-by-Prime 後端會在需要 3DS / LINE Pay 授權時回傳 payment_url，前端必須
// 把整個 webview 導去那個網址。
//
// 在 LINE webview 裡 `window.location.href = url` 跳到外部支付頁常被吞掉
// （使用者看到「付款中…」一直停在那）。TapPay 官方 doc 規定要用
//     TPDirect.redirect(payment_url)
// 由 SDK 控制跳轉，內部會處理 LINE webview 的相容性。
//
// 抽成 helper 是為了單元測試可以 mock window.TPDirect.redirect。

interface TPDirectLike {
  redirect?: (url: string) => void
}

export function redirectToPaymentUrl(url: string): void {
  if (typeof window === 'undefined') return
  console.log('[payment-redirect]', url)
  const tp = (window as unknown as { TPDirect?: TPDirectLike }).TPDirect
  if (tp && typeof tp.redirect === 'function') {
    tp.redirect(url)
    // TPDirect.redirect 內部如果 URL validation 失敗（xe(t) 回 false）會 console.error
    // 後直接 return，不會 navigate。為了避免使用者卡在「付款中」，掛一個 200ms 的
    // 保險：若到時 window.location 沒換過，直接強制 window.location.href 跳過去。
    const before = window.location.href
    setTimeout(() => {
      if (window.location.href === before) {
        console.warn('[payment-redirect] TPDirect.redirect did not navigate, forcing window.location.href')
        window.location.href = url
      }
    }, 200)
    return
  }
  // SDK 沒載入或不支援時 fallback。
  window.location.href = url
}
