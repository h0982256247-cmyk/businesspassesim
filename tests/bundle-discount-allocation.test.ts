import { describe, it, expect } from 'vitest'
import { allocateDiscountByWeight } from '@/lib/services/order'

// 購物車「折總額」把總折扣按各筆原價比例攤回每一筆。這支函式是金流分攤的核心：
// 加總必須剛好等於總折扣（不可因 rounding 多扣/少扣），且每筆不超過自己的原價。
describe('allocateDiscountByWeight', () => {
  it('按比例分攤且加總剛好等於總折扣', () => {
    const r = allocateDiscountByWeight([600, 400], 100)
    expect(r).toEqual([60, 40])
    expect(r.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('rounding 用最大餘數法補齊，總和不漏一塊錢', () => {
    const r = allocateDiscountByWeight([100, 100, 100], 100)
    expect(r.reduce((a, b) => a + b, 0)).toBe(100) // 33.33×3 → 34/33/33
    expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1)
  })

  it('單筆 → 全部折扣落在該筆', () => {
    expect(allocateDiscountByWeight([1000], 271)).toEqual([271])
  })

  it('折扣為 0 → 全 0', () => {
    expect(allocateDiscountByWeight([700, 300], 0)).toEqual([0, 0])
  })

  it('原價全 0（理論上不會發生）→ 全 0，不丟例外', () => {
    expect(allocateDiscountByWeight([0, 0], 50)).toEqual([0, 0])
  })

  it('每一筆折扣都不超過自己的原價', () => {
    const weights = [1, 5, 50, 944]
    const total = 700
    const r = allocateDiscountByWeight(weights, total)
    expect(r.reduce((a, b) => a + b, 0)).toBe(total)
    r.forEach((d, i) => expect(d).toBeLessThanOrEqual(weights[i]))
  })

  it('不平均權重也精確加總', () => {
    const r = allocateDiscountByWeight([333, 667], 271)
    expect(r.reduce((a, b) => a + b, 0)).toBe(271)
  })
})
