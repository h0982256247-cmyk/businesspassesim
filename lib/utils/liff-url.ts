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

  // 單張/多張一律回到訂單列表頁（?paid=1 觸發回購券慶祝彈窗）；多張另帶 bundleId 供列表辨識。
  const base = `${origin}/liff/${tenantSlug}`
  return isBundle
    ? `${base}/orders?bundleId=${encodeURIComponent(orderIdOrBundleId)}&paid=1`
    : `${base}/orders?paid=1&oid=${encodeURIComponent(orderIdOrBundleId)}`
}
