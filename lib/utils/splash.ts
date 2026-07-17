// 過場（splash）畫面只在每個瀏覽 session 第一次進入時播放。
// sessionStorage 在 client 端導航間會保留，但開新分頁／重新點網址（新 session）
// 會重置 —— 正好符合「只有第一次點擊網址進入才需要過場」的需求。

const SPLASH_SEEN_KEY = 'bee_splash_seen'

/** 本次 session 是否已經看過過場畫面。SSR 期間一律回傳 false。 */
export function hasSeenSplash(): boolean {
  if (typeof window === 'undefined') return false
  try { return sessionStorage.getItem(SPLASH_SEEN_KEY) === '1' } catch { return false }
}

/** 標記本次 session 已看過過場畫面。 */
export function markSplashSeen(): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(SPLASH_SEEN_KEY, '1') } catch {}
}
