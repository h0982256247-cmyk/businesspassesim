import { enCountryName } from './country-names'
import type { Messages } from './messages'

interface PlanItem {
  productName?: string | null
  product?: {
    countryNameZh?: string | null
    countryNameEn?: string | null
    displayDays?: number | null
    dataCapacity?: string | null
  } | null
}

// 訂單／eSIM 卡片的方案標題：
//   英文模式 → 用結構欄位重組（國名對照表＋天數＋流量），與首頁國名一致；
//   中文模式，或商品已無結構欄位（如已刪）→ 沿用建立訂單時快照的 productName。
export function planTitle(locale: string, t: Messages, item: PlanItem | null | undefined): string {
  const fallback = item?.productName || 'eSIM'
  const p = item?.product
  if (locale !== 'en' || !p?.countryNameZh) return fallback
  const parts = [
    enCountryName(p.countryNameZh, p.countryNameEn),
    p.displayDays ? `${p.displayDays} ${p.displayDays === 1 ? 'day' : 'days'}` : null,
    p.dataCapacity ? t.formatCapacity(p.dataCapacity) : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : fallback
}
