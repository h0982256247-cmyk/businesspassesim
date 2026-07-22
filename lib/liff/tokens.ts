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

/** 全站字體堆疊。LINE webview：iOS 走 SF Pro、Android fallback 系統 sans-serif。 */
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'
