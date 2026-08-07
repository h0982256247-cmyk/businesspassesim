// 企業福利價（PRD 五）：福利價 = 成本 × 倍率。倍率單一來源為 PlatformSetting.benefitMarkupRate，
// 預設 1.5。商品匯入/新增/後台計算一律走這支，不要在各處寫死 ×1.5。
//
// 售價（sellPrice）一律由後台/Excel 手動設定，不隨成本變動（業主定案 2026-08，
// 舊的「成本上升售價跟漲」與「毛利保護補到門檻」已移除）。
export const DEFAULT_BENEFIT_MARKUP = 1.5

export function benefitPriceFromCost(cost: number, markup: number = DEFAULT_BENEFIT_MARKUP): number {
  return Math.round(cost * markup)
}
