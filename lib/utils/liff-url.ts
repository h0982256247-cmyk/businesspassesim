// LIFF 內部 URL 組裝 helper。所有租戶都走 /liff/<slug>/... 路徑，未來開新
// slug 給其他人也只要 tenantSlug 對應正確就會跑到對的品牌頁。
//
// 用於：
//   - TapPay frontend_redirect_url（信用卡 3DS / LINE Pay 完成後跳回的路徑）
//   - 任何 backend → user 的訂單／結帳 URL fallback
//
// 注意：前端送 returnUrl 進來時通常已經是完整的絕對 URL（origin + 帶 slug
// 的路徑），可直接用；本 helper 是給「前端沒送」或「需要 server 自己組」
// 的情境用，避免後端寫死舊的 (liff) 群組路徑（已不存在）。

/** TapPay 回跳網址（frontend_redirect_url）的白名單。
 *
 * 該值由前端送進來、原樣交給 TapPay，付款流程結束後瀏覽器會被導過去。不設限
 * 就是 open redirect：誘導受害者從攻擊者準備的連結下單，付款完成後導到假的
 * 「付款完成」頁繼續釣卡號。
 *
 * 前端只會送兩種來源（見 checkout 的 buildReturnUrl）：
 *   1. liff.permanentLink.createUrlBy() → https://liff.line.me/...
 *   2. liff 不可用（桌面測試）時 fallback → 自家 origin 的絕對 URL
 * 因此只放行這兩種；其餘一律當作「前端沒送」，改用 buildLiffOrderUrl 自行組。
 */
export function isAllowedReturnUrl(returnUrl: string, origin: string): boolean {
  let u: URL
  try {
    u = new URL(returnUrl)   // 相對路徑／非法 URL 會丟例外 → 不放行
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  // hostname 精確比對：https://liff.line.me@evil.com/ 的 hostname 是 evil.com，
  // liff.line.me.evil.com 也不會命中。
  return u.origin === origin || u.hostname === 'liff.line.me'
}

export interface BuildLiffOrderUrlInput {
  origin: string             // ${req.nextUrl.origin}
  tenantSlug: string | null  // 從 user.tenantAdminId 反查；null 代表 fallback 到主網域
  /** 單張：傳 orderId；多張：傳 bundleId */
  orderIdOrBundleId: string
  /** 是否為 bundle，決定 URL 結構 */
  isBundle: boolean
}

export function buildLiffOrderUrl(input: BuildLiffOrderUrlInput): string {
  const { origin, tenantSlug, orderIdOrBundleId, isBundle } = input

  // 沒 slug → 退回主網域；middleware 會把使用者導到登入頁，至少不是 404。
  if (!tenantSlug) {
    return `${origin}/`
  }

  // 單張/多張一律回到訂單列表頁（?paid=1 標記付款完成落地）；多張另帶 bundleId 供列表辨識。
  const base = `${origin}/liff/${tenantSlug}`
  return isBundle
    ? `${base}/orders?bundleId=${encodeURIComponent(orderIdOrBundleId)}&paid=1`
    : `${base}/orders?paid=1&oid=${encodeURIComponent(orderIdOrBundleId)}`
}
