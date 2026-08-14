import type { PaymentMethod } from '@prisma/client'

// 金流手續費率（業主提供）。以「整數基點 / 10000」表示，避免浮點誤差：
//   LINE Pay 2.31%；信用卡 國內 2.2% / 國外 2.8%。
export const FEE_BP = {
  LINE_PAY: 231,
  CREDIT_DOMESTIC: 220,
  CREDIT_FOREIGN: 280,
} as const

// 發卡國是否視為「國外」。null/空/台灣 → 國內（保守：未知一律當國內 2.2%）。
// TapPay card_info.country_code 可能是 TWN / TW / 158 / TAIWAN 等表示台灣。
export function isForeignCard(cardIssuerCountry: string | null | undefined): boolean {
  if (!cardIssuerCountry) return false
  const c = cardIssuerCountry.trim().toUpperCase()
  if (!c) return false
  return !['TWN', 'TW', '158', 'TAIWAN'].includes(c)
}

// 單筆（或單次結帳）金流手續費，四捨五入到整數。
// 未付款（paidAt 為空）回 null → 前端/報表顯示「—」（未實際扣款、無手續費）。
export function processingFee(input: {
  paymentMethod: PaymentMethod
  totalPaid: number
  paidAt: Date | string | null | undefined
  cardIssuerCountry?: string | null
}): number | null {
  if (!input.paidAt) return null
  const bp =
    input.paymentMethod === 'LINE_PAY'
      ? FEE_BP.LINE_PAY
      : isForeignCard(input.cardIssuerCountry)
        ? FEE_BP.CREDIT_FOREIGN
        : FEE_BP.CREDIT_DOMESTIC
  // 整數運算：實付 × 基點 為整數，再 /10000 得最多四位小數，Math.round 四捨五入到整數。
  return Math.round((input.totalPaid * bp) / 10000)
}
