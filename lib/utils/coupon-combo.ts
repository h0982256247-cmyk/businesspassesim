// 共用：最優惠優惠券組合計算
// 規則：A 級（<0.8）單獨、B 級（0.8–0.89）最多 1 張可搭 1 張 C、C 級（0.9–0.99）最多 3 張

export interface CouponItem {
  id: string
  discount: number
}

function getLevel(discount: number): 'A' | 'B' | 'C' {
  if (discount < 0.8) return 'A'
  if (discount < 0.9) return 'B'
  return 'C'
}

function calcPrice(price: number, ids: string[], coupons: CouponItem[]): number {
  return Math.round(ids.reduce((acc, id) => {
    const c = coupons.find(x => x.id === id)
    return c ? acc * c.discount : acc
  }, price))
}

/** 返回最划算的優惠券 ID 陣列 */
export function findBestCouponCombo(coupons: CouponItem[], price: number): string[] {
  if (coupons.length === 0) return []

  const A = coupons.filter(c => getLevel(c.discount) === 'A').sort((a, b) => a.discount - b.discount)
  const B = coupons.filter(c => getLevel(c.discount) === 'B').sort((a, b) => a.discount - b.discount)
  const C = coupons.filter(c => getLevel(c.discount) === 'C').sort((a, b) => a.discount - b.discount)

  let bestIds: string[] = []
  let bestPrice = price

  // 方案 1：最佳 A 級單張
  if (A.length > 0) {
    const p = calcPrice(price, [A[0].id], coupons)
    if (p < bestPrice) { bestPrice = p; bestIds = [A[0].id] }
  }

  // 方案 2：最佳 B + 最佳 C（0 或 1 張）
  if (B.length > 0) {
    const bId = B[0].id
    const p1 = calcPrice(price, [bId], coupons)
    if (p1 < bestPrice) { bestPrice = p1; bestIds = [bId] }
    if (C.length > 0) {
      const combo = [bId, C[0].id]
      const p2 = calcPrice(price, combo, coupons)
      if (p2 < bestPrice) { bestPrice = p2; bestIds = combo }
    }
  }

  // 方案 3：最佳 1–3 張 C 級
  const topC = C.slice(0, 3)
  for (let n = 1; n <= topC.length; n++) {
    const ids = topC.slice(0, n).map(c => c.id)
    const p = calcPrice(price, ids, coupons)
    if (p < bestPrice) { bestPrice = p; bestIds = ids }
  }

  return bestIds
}

/** 計算套用最優組合後的折後價與省下金額 */
export function calcBestPrice(coupons: CouponItem[], price: number): {
  bestPrice: number
  savedAmount: number
  hasDiscount: boolean
} {
  const ids = findBestCouponCombo(coupons, price)
  const bestPrice = calcPrice(price, ids, coupons)
  return {
    bestPrice,
    savedAmount: price - bestPrice,
    hasDiscount: bestPrice < price,
  }
}
