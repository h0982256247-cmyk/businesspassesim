// LIFF 前台「靜態設計常數」的單一來源。
//
// 這裡只放「不隨租戶品牌色改變」的設計 token；品牌色一律走 useTenantColors()
// 的 C.*（動態、per-tenant）。分工：C.* = 品牌色，此檔 = 中性色／版面尺度。
//
// 由來：white/ink/muted/faint/line 這套中性色原本在 orders、profile、guide、
// company、gift、products/[id]、profile/setup 等頁各自重複定義一份，值幾乎相同、
// 卻靠人肉維持一致。收斂成單一來源後，跨頁的「次要文字」「分隔線」才會真正同色。
//
// 後續 Layer 會在此檔補上圓角（R）、陰影（SH）、語意色（SEM）等 scale，逐頁遷移。

/** 中性色階（與租戶品牌色無關）。沿用專案既有值。 */
export const S = {
  white: '#ffffff',
  ink:   '#1a1a1a',            // 主要文字／標題
  muted: '#4b5563',            // 次要文字
  faint: '#94a3b8',            // 輔助文字／placeholder
  line:  'rgba(0,0,0,0.07)',   // 邊框／分隔線
  bg:    '#f9f9f9',            // 內頁畫布底色（首頁 hero 的 #EEEEF8 為刻意特色，不納入）
} as const

/** 中性卡片邊框：次要／已完成的列表卡用。
 *
 * S.line（7% 黑）當卡片外框在 S.bg 上幾乎看不見——白卡與底色只差 3% 亮度，
 * 使用者回報「框格太不明顯」。故卡片另用這組較實的邊框，不動 S.line
 * （它仍是分隔線／表單框的正確值，全站多處在用）。
 *
 * 需要吸睛的「主要動作卡」不用這個，改用品牌色淡邊（見 orders 頁的
 * actionCardSurface）；品牌色不進本檔，本檔只收與租戶無關的中性值。
 * 目前由「我的 eSIM」歷史列使用，其餘頁面逐頁遷移。 */
export const CARD = {
  border: '1px solid rgba(15,23,42,0.12)',
} as const

/** 全站字體堆疊。LINE webview：iOS 走 SF Pro、Android fallback 系統 sans-serif。 */
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'
