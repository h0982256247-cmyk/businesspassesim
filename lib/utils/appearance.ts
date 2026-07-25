// 前台版位圖片的「比例 / 建議尺寸 / 上傳縮圖上限」單一來源。
// 後台上傳頁（建議尺寸、預覽框比例）與前台顯示（卡片 aspect-ratio）都讀這裡，
// 保證「後台叫你上傳的尺寸」＝「前台實際顯示的形狀」，不會各寫各的走鐘。
//
// ratio：寬/高（給 CSS aspect-ratio 與後台預覽框共用）
// label：後台顯示的建議像素
// maxEdge：前端上傳前縮圖的最長邊上限
export const APPEARANCE = {
  home: { ratio: 16 / 9, label: '16:9 · 1920 × 1080', maxEdge: 1920 }, // 主頁首圖：16:9
  shop: { ratio: 16 / 9, label: '16:9 · 1920 × 1080', maxEdge: 1920 }, // 商城頂端圖：16:9（與首圖一致）
  dest: { ratio: 1,      label: '1:1 · 800 × 800',     maxEdge: 1000 }, // 國家卡：1:1 正方形（前台就是接近正方形）
} as const

export type AppearanceKind = keyof typeof APPEARANCE
