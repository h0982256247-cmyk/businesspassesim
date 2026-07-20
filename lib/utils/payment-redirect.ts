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
    // 導轉一旦開始（含 3DS / LINE Pay 常用的表單送出）會觸發 pagehide / beforeunload →
    // 標記 navigating。TPDirect.redirect 的導轉未必同步反映到 window.location.href
    // （表單送出時尚未 commit），若在那空窗期用 fallback 再打一次，就會對「一次性的
    // 3DS 網址」二次請求，TapPay 回「Duplicate Request（重複請求驗證）」。
    const before = window.location.href
    let navigating = false
    const mark = () => { navigating = true }
    window.addEventListener('pagehide', mark, { once: true })
    window.addEventListener('beforeunload', mark, { once: true })
    tp.redirect(url)
    // 只有「確定沒開始導轉」時才 fallback（TPDirect 內部 URL validation 失敗會 return、
    // 不 navigate）。拉長到 3s 讓真正的導轉先 commit（慢網路下 3DS 表單送出到 commit
    // 可能較久），避免二次請求一次性網址。
    setTimeout(() => {
      if (!navigating && window.location.href === before) {
        console.warn('[payment-redirect] TPDirect.redirect did not navigate, forcing window.location.href')
        window.location.href = url
      }
    }, 3000)
    return
  }
  // SDK 沒載入或不支援時 fallback。
  window.location.href = url
}
