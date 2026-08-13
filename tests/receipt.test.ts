import { describe, it, expect } from 'vitest'
import { formatReceiptNumber, amountToTwdWords } from '@/lib/utils/receipt'

describe('formatReceiptNumber', () => {
  it('W + 西元年後2碼 + 月 + 日 + L + 4位流水', () => {
    expect(formatReceiptNumber(2026, 8, 8, 1)).toBe('W260808L0001')
    expect(formatReceiptNumber(2026, 12, 25, 42)).toBe('W261225L0042')
    expect(formatReceiptNumber(2027, 1, 3, 1234)).toBe('W270103L1234')
  })
})

describe('amountToTwdWords', () => {
  it('依附圖固定版位（零補到佰萬位、結尾整）', () => {
    expect(amountToTwdWords(211)).toBe('零佰零拾零萬零仟貳佰壹拾壹元整')
    expect(amountToTwdWords(79)).toBe('零佰零拾零萬零仟零佰柒拾玖元整')
    expect(amountToTwdWords(3450)).toBe('零佰零拾零萬參仟肆佰伍拾零元整')
  })

  it('萬位以上正常進位', () => {
    expect(amountToTwdWords(1234567)).toBe('壹佰貳拾參萬肆仟伍佰陸拾柒元整')
  })

  it('四捨五入、負數保護', () => {
    expect(amountToTwdWords(210.6)).toBe('零佰零拾零萬零仟貳佰壹拾壹元整')
    expect(amountToTwdWords(-5)).toBe('零佰零拾零萬零仟零佰零拾零元整')
  })
})
