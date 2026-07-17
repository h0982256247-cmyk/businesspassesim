// 商品頁進入時的「想用幾天」預設值挑選邏輯。
// 規則：永遠以 5 天為預設；若該國家沒有 5 天方案，fallback 到 availableDays 中距離 5 最近的值。
// 抽成共用 helper 是為了讓 (liff) 與 liff/[slug] 兩條路徑共用同一份邏輯（避免再次只改一邊）。
//
// 為什麼要把 useState 直接初始化成 PRODUCTS_DEFAULT_DAYS 而不是 0？
// 之前 pickerDays/dayFilter 都從 0 起跑，靠 useEffect 設成 5 → 第一次 paint
// 顯示「340 個方案、picker=0/1」，下一個 paint 才變「已篩選 17/340、picker=5」，
// 使用者進場會看到一次明顯的閃爍。改用 5 為 useState 初始值即可消除：
// 第一個 paint 就已經是篩選後狀態，只剩「該國家沒有 5 天方案」時的 fallback
// useEffect 還會跑。

export const PRODUCTS_DEFAULT_DAYS = 5

export function pickInitialDay(availableDays: readonly number[]): number | null {
  if (availableDays.length === 0) return null
  if (availableDays.includes(PRODUCTS_DEFAULT_DAYS)) return PRODUCTS_DEFAULT_DAYS
  return [...availableDays].sort(
    (a, b) => Math.abs(a - PRODUCTS_DEFAULT_DAYS) - Math.abs(b - PRODUCTS_DEFAULT_DAYS),
  )[0]
}
