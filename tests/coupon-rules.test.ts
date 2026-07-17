import { describe, it, expect } from 'vitest'
import {
  getCouponLevel,
  validateCouponCombination,
  calculateFinalPrice,
} from '@/lib/services/coupon'
import {
  findBestCouponCombo,
  calcBestPrice,
  type CouponItem,
} from '@/lib/utils/coupon-combo'

// 優惠券折扣是金流核心：等級分界、併用規則、連續折價、最優組合。
// 這些是純函式（無 DB），但任何一條算錯都會直接多扣/少扣使用者的錢，
// 因此把實際行為（含分界值與中文錯誤訊息）鎖死，避免日後無意間改壞。

describe('getCouponLevel — 折扣→等級分界', () => {
  it('< 0.8 為 A 級', () => {
    expect(getCouponLevel(0.70)).toBe('A')
    expect(getCouponLevel(0.79)).toBe('A')
    expect(getCouponLevel(0.799)).toBe('A')
  })

  it('0.8 是 B 級的下界（0.8 不算 A）', () => {
    expect(getCouponLevel(0.80)).toBe('B')
    expect(getCouponLevel(0.85)).toBe('B')
    expect(getCouponLevel(0.89)).toBe('B')
  })

  it('0.9 是 C 級的下界（0.9 不算 B）', () => {
    expect(getCouponLevel(0.90)).toBe('C')
    expect(getCouponLevel(0.95)).toBe('C')
    expect(getCouponLevel(0.99)).toBe('C')
  })
})

describe('validateCouponCombination — 併用規則', () => {
  it('空組合 → 合法', () => {
    expect(validateCouponCombination([])).toEqual({ valid: true })
  })

  it('A 級單張 → 合法', () => {
    expect(validateCouponCombination([0.7])).toEqual({ valid: true })
  })

  it('A 級不可與任何券併用', () => {
    const r = validateCouponCombination([0.7, 0.95])
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('A 級券不可與其他券併用')
  })

  it('兩張 A 也算併用 → 不合法', () => {
    const r = validateCouponCombination([0.7, 0.75])
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('A 級券不可與其他券併用')
  })

  it('B 級最多一張', () => {
    expect(validateCouponCombination([0.85]).valid).toBe(true)
    const r = validateCouponCombination([0.85, 0.82])
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('不可同時使用多張 B 級券')
  })

  it('B 搭 1 張 C → 合法；B 搭 2 張 C → 不合法', () => {
    expect(validateCouponCombination([0.85, 0.95]).valid).toBe(true)
    const r = validateCouponCombination([0.85, 0.95, 0.96])
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('B 級券最多只能搭配 1 張 C 級券')
  })

  it('C 級最多三張', () => {
    expect(validateCouponCombination([0.95, 0.96, 0.97]).valid).toBe(true)
    const r = validateCouponCombination([0.95, 0.96, 0.97, 0.98])
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('C 級券最多同時使用 3 張')
  })
})

describe('calculateFinalPrice — 連續折價（非加總）', () => {
  it('無券 → 原價', () => {
    expect(calculateFinalPrice(1000, [])).toBe(1000)
  })

  it('單張券 → 原價×折扣（四捨五入）', () => {
    expect(calculateFinalPrice(1380, [0.8])).toBe(1104)
  })

  it('多張券連乘，非相加', () => {
    // 1000×0.9×0.95 = 855，不是 1000×(1-0.1-0.05)=850
    expect(calculateFinalPrice(1000, [0.9, 0.95])).toBe(855)
  })

  it('折扣順序不影響結果', () => {
    expect(calculateFinalPrice(1000, [0.9, 0.95])).toBe(
      calculateFinalPrice(1000, [0.95, 0.9]),
    )
  })

  it('非整數結果四捨五入', () => {
    // 999×0.85 = 849.15 → 849
    expect(calculateFinalPrice(999, [0.85])).toBe(849)
  })
})

describe('findBestCouponCombo — 最優惠組合挑選', () => {
  it('沒有券 → 空陣列', () => {
    expect(findBestCouponCombo([], 1000)).toEqual([])
  })

  it('單張 A → 選它', () => {
    const coupons: CouponItem[] = [{ id: 'a', discount: 0.7 }]
    expect(findBestCouponCombo(coupons, 1000)).toEqual(['a'])
  })

  it('A 比疊三張 C 更划算 → 選 A（且不與 C 併用）', () => {
    const coupons: CouponItem[] = [
      { id: 'a', discount: 0.7 },
      { id: 'c1', discount: 0.95 },
      { id: 'c2', discount: 0.95 },
      { id: 'c3', discount: 0.95 },
    ]
    expect(findBestCouponCombo(coupons, 1000)).toEqual(['a'])
  })

  it('疊三張 C 比單張 C 更划算 → 全選', () => {
    const coupons: CouponItem[] = [
      { id: 'c1', discount: 0.9 },
      { id: 'c2', discount: 0.9 },
      { id: 'c3', discount: 0.9 },
    ]
    const ids = findBestCouponCombo(coupons, 1000)
    expect(ids).toHaveLength(3)
    expect(new Set(ids)).toEqual(new Set(['c1', 'c2', 'c3']))
  })

  it('B+C 比 B 單張或 C 單張都划算 → 選 B+C', () => {
    const coupons: CouponItem[] = [
      { id: 'b', discount: 0.85 },
      { id: 'c', discount: 0.9 },
    ]
    const ids = findBestCouponCombo(coupons, 1000)
    expect(new Set(ids)).toEqual(new Set(['b', 'c']))
  })

  it('最多只挑前 3 張 C（第 4 張再低也不超用）', () => {
    const coupons: CouponItem[] = [
      { id: 'c1', discount: 0.9 },
      { id: 'c2', discount: 0.91 },
      { id: 'c3', discount: 0.92 },
      { id: 'c4', discount: 0.93 },
    ]
    expect(findBestCouponCombo(coupons, 1000)).toHaveLength(3)
  })
})

describe('calcBestPrice — 折後價與省下金額', () => {
  it('無券 → 不打折', () => {
    expect(calcBestPrice([], 1000)).toEqual({
      bestPrice: 1000,
      savedAmount: 0,
      hasDiscount: false,
    })
  })

  it('有券 → 回傳折後價與省下金額', () => {
    const coupons: CouponItem[] = [{ id: 'b', discount: 0.8 }]
    expect(calcBestPrice(coupons, 1000)).toEqual({
      bestPrice: 800,
      savedAmount: 200,
      hasDiscount: true,
    })
  })
})

describe('不變量：挑選器永遠不會回傳違反併用規則的組合', () => {
  const sets: CouponItem[][] = [
    [{ id: 'a', discount: 0.7 }, { id: 'b', discount: 0.85 }, { id: 'c', discount: 0.95 }],
    [{ id: 'c1', discount: 0.9 }, { id: 'c2', discount: 0.91 }, { id: 'c3', discount: 0.92 }, { id: 'c4', discount: 0.93 }],
    [{ id: 'b1', discount: 0.82 }, { id: 'b2', discount: 0.88 }, { id: 'c1', discount: 0.9 }, { id: 'c2', discount: 0.95 }],
    [{ id: 'a1', discount: 0.6 }, { id: 'a2', discount: 0.75 }],
  ]

  it.each(sets.map((s, i) => [i, s] as const))('組合 %i 通過 validateCouponCombination', (_i, coupons) => {
    const ids = findBestCouponCombo(coupons, 1234)
    const discounts = ids.map(id => coupons.find(c => c.id === id)!.discount)
    expect(validateCouponCombination(discounts).valid).toBe(true)
  })
})
