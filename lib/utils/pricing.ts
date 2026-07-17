// 售價隨成本調整的共用規則（驗證套用 /api/admin/products/validate/apply 與
// 匯入 batchCreateProducts 共用，確保兩邊邏輯一致）。業主定案 2026-06：
//   - 成本「上升」→ 售價維持原本的絕對利潤跟漲（售價 += 成本漲幅）
//   - 成本不變 / 下降 → 不主動調售價（只漲不降）
//   - 毛利保護開啟時，售價不得低於門檻毛利（補到剛好門檻）

// 達到指定毛利率的最低售價：margin=(sell−cost)/sell ≥ rate ⟺ sell ≥ cost/(1−rate)。
// rate 不在 (0,1) 區間時不設限，直接回傳 cost。
export function sellForMinMargin(cost: number, rate: number): number {
  if (!(rate > 0 && rate < 1)) return cost
  return Math.ceil(cost / (1 - rate))
}

export interface SellAdjustInput {
  oldCost: number
  oldSell: number
  newCost: number
  guardEnabled: boolean
  minMarginRate: number   // 0~1，例 0.40 = 40%
}

// 依新成本算出應有售價。
export function sellPriceForCostChange(input: SellAdjustInput): number {
  const { oldCost, oldSell, newCost, guardEnabled, minMarginRate } = input
  if (newCost <= oldCost) return oldSell           // 只漲不降
  let sell = oldSell + (newCost - oldCost)         // 維持固定利潤
  if (guardEnabled) sell = Math.max(sell, sellForMinMargin(newCost, minMarginRate))
  return sell
}

export interface MarginGuard {
  enabled: boolean
  rate: number   // 0~1
}

export const DEFAULT_MARGIN_GUARD: MarginGuard = { enabled: false, rate: 0.40 }
