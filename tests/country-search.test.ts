import { describe, it, expect } from 'vitest'
import { filterCountriesByQuery, normalizeSearchQuery } from '@/lib/utils/country-search'

const COUNTRIES = [
  { countryCode: 'JP', countryNameZh: '日本', countryNameEn: 'Japan' },
  { countryCode: 'KR', countryNameZh: '韓國', countryNameEn: 'Korea' },
  { countryCode: 'HK', countryNameZh: '香港', countryNameEn: 'Hong Kong' },
  { countryCode: 'CN_HK_MO', countryNameZh: '中港澳', countryNameEn: 'China HK Macau' },
  { countryCode: 'US', countryNameZh: '美國', countryNameEn: 'USA' },
]

// 中港澳的方案適用國家字串涵蓋香港；香港本身也有方案
const COVERAGE = [
  { countryCode: 'CN_HK_MO', coverageCountries: '中國、香港、澳門' },
  { countryCode: 'HK', coverageCountries: '香港' },
  { countryCode: 'JP', coverageCountries: '日本' },
]

describe('filterCountriesByQuery — 目的地搜尋（主頁與商城共用）', () => {
  it('打「日」即出現日本（部分國名命中）', () => {
    const r = filterCountriesByQuery(COUNTRIES, '日', COVERAGE)
    expect(r.map(c => c.countryCode)).toContain('JP')
  })

  it('打「香港」時，香港本身與涵蓋香港的中港澳都要出現（適用國家聯集）', () => {
    const r = filterCountriesByQuery(COUNTRIES, '香港', COVERAGE)
    const codes = r.map(c => c.countryCode)
    expect(codes).toContain('HK')
    expect(codes).toContain('CN_HK_MO')
  })

  it('英文查詢不分大小寫（korea → 韓國）', () => {
    const r = filterCountriesByQuery(COUNTRIES, 'korea', COVERAGE)
    expect(r.map(c => c.countryCode)).toEqual(['KR'])
  })

  it('空查詢回傳原清單、不動順序', () => {
    expect(filterCountriesByQuery(COUNTRIES, '', COVERAGE)).toEqual(COUNTRIES)
    expect(filterCountriesByQuery(COUNTRIES, '   ', COVERAGE)).toEqual(COUNTRIES)
  })

  it('查無結果回空陣列', () => {
    expect(filterCountriesByQuery(COUNTRIES, '泰國', COVERAGE)).toEqual([])
  })

  it('coverage 來源為空時退化成純國名比對（背景商品尚未回來的情境）', () => {
    const r = filterCountriesByQuery(COUNTRIES, '香港', [])
    expect(r.map(c => c.countryCode)).toEqual(['HK']) // 中港澳靠 coverage 命中，此時不出現
  })

  it('normalizeSearchQuery 去除注音組字殘留（選字前不誤判成找不到）', () => {
    // 使用者打「日本」但 IME 還停在注音「ㄖ」時
    expect(normalizeSearchQuery('ㄖ')).toBe('')
    expect(normalizeSearchQuery('日ㄅㄣ')).toBe('日')
    // 已選完字則原樣（去空白、轉小寫）
    expect(normalizeSearchQuery('  Japan ')).toBe('japan')
  })
})
