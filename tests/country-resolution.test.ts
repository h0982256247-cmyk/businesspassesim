import { describe, it, expect } from 'vitest'
import {
  resolveCountry,
  resolveCountryByPlanCode,
  matchCountryInText,
  COUNTRY_NAME_TO_CODE,
  CODE_TO_NAME_ZH,
} from '@/lib/utils/country'

describe('country resolution — Africa / AFR region', () => {
  it('exposes 非洲 → AFR in COUNTRY_NAME_TO_CODE', () => {
    expect(COUNTRY_NAME_TO_CODE['非洲']).toBe('AFR')
  })

  it('CODE_TO_NAME_ZH derives AFR → 非洲 (regression: was missing → produced "非洲A" UI)', () => {
    expect(CODE_TO_NAME_ZH['AFR']).toBe('非洲')
  })

  it('resolveCountryByPlanCode handles supplier plan codes like AFR-A-T30-3D', () => {
    const r = resolveCountryByPlanCode('AFR-A-T30-3D')
    expect(r).not.toBeNull()
    expect(r?.code).toBe('AFR')
    expect(r?.zh).toBe('非洲')
  })

  it('resolveCountryByPlanCode handles different zone suffixes (AFR-B, AFR-C)', () => {
    expect(resolveCountryByPlanCode('AFR-B-1GB-1D')?.zh).toBe('非洲')
    expect(resolveCountryByPlanCode('AFR-C-MAX-1D')?.zh).toBe('非洲')
  })

  it('matchCountryInText falls back to substring match for noisy supplier names', () => {
    // 供應商商品名通常帶 zone 後綴或流量字樣，substring 比對應該把 "非洲" 抓出來
    expect(matchCountryInText('非洲A')?.zh).toBe('非洲')
    expect(matchCountryInText('非洲A 30GB吃到飽')?.zh).toBe('非洲')
    expect(matchCountryInText('非洲, 30天, 30GB')?.zh).toBe('非洲')
  })

  it('does not confuse 南非 (South Africa) with 非洲 (continent) — longer key wins', () => {
    // 南非 = 'ZA' 是國家；非洲 = 'AFR' 是區域。keys 已按長度排序，避免短的 "非洲" 搶到 "南非" 的字串
    expect(matchCountryInText('南非')?.code).toBe('ZA')
    expect(matchCountryInText('南非 30GB')?.code).toBe('ZA')
  })
})

describe('country resolution — 南美 / SAM region', () => {
  it('exposes 南美 → SAM in COUNTRY_NAME_TO_CODE', () => {
    expect(COUNTRY_NAME_TO_CODE['南美']).toBe('SAM')
    expect(COUNTRY_NAME_TO_CODE['南美洲']).toBe('SAM')
  })

  it('CODE_TO_NAME_ZH derives SAM → 南美 (regression: 之前無 mapping → 存成 XX、flag 顯示破圖)', () => {
    expect(CODE_TO_NAME_ZH['SAM']).toBe('南美')
  })

  it('matchCountryInText 抓得到現有「南美A」資料（substring，免重上傳也能重算成 SAM）', () => {
    expect(matchCountryInText('南美A')?.code).toBe('SAM')
    expect(matchCountryInText('南美A')?.zh).toBe('南美')
    expect(matchCountryInText('南美A 30GB吃到飽')?.code).toBe('SAM')
    expect(matchCountryInText('南美, 10天, 每日1GB')?.code).toBe('SAM')
  })

  it('不會把 南美 誤抓成 南非 / 美國', () => {
    expect(matchCountryInText('南美')?.code).toBe('SAM')
    expect(matchCountryInText('南非')?.code).toBe('ZA')
  })
})

describe('resolveCountry — 前台國家取 D 欄「適用地區」（業主 2026-07 定案）', () => {
  const R = (name: string, region: string) => resolveCountry(name, '', region, '', '')

  it('單一國家 D → ISO 碼 + D 當卡標題（不受商品名稱「｜」雜訊影響）', () => {
    expect(R('中國大陸 eSIM｜1天 每日1GB 降速128kbps', '中國大陸'))
      .toMatchObject({ countryCode: 'CN', countryNameZh: '中國大陸' })
    expect(R('日本 eSIM｜Softbank｜90天 總量15GB', '日本'))
      .toMatchObject({ countryCode: 'JP', countryNameZh: '日本' })
  })

  it('組合地區 D → 區域碼，且同地區一律聚成一張卡', () => {
    expect(R('中港澳 eSIM｜1天 每日1GB', '中港澳'))
      .toMatchObject({ countryCode: 'CNT', countryNameZh: '中港澳' })
    expect(R('南美 eSIM｜10天 總量5GB', '南美'))
      .toMatchObject({ countryCode: 'SAM', countryNameZh: '南美' })
    // 同一 D、不同方案名 → countryCode 一致（避免爆成多張卡）
    expect(R('中港澳 eSIM｜3天 高速吃到飽', '中港澳').countryCode).toBe('CNT')
  })

  it('D 欄為空 → 退回舊行為（取商品名稱逗號前段）', () => {
    expect(R('美國, 10天, 3GB/天', '')).toMatchObject({ countryCode: 'US', countryNameZh: '美國' })
  })
})
