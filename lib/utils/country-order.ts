// 商城國家卡的排列順序（業主指定 2026-07）。以 countryCode 為鍵（對應 resolveCountry 產出的代碼）。
// 前台商城依此排序；主頁「熱門目的地」取此排序的前 6 個。
// 清單未列到的國家排在最後、保持原相對順序（stable）。
// 要改順序：直接調整這個陣列即可——重新匯入商品不會影響此順序（不依賴 DB sortOrder）。
export const COUNTRY_DISPLAY_ORDER: readonly string[] = [
  'JP',    // 日本
  'CN',    // 中國大陸
  'KR',    // 韓國
  'HKM',   // 港澳
  'CNT',   // 中港澳
  'VN',    // 越南
  'TH',    // 泰國
  'JPK',   // 日韓
  'NMY',   // 新馬
  'SG',    // 新加坡
  'US',    // 美國
  'USCA',  // 美加墨
  'PH',    // 菲律賓
  'EU',    // 歐洲
  'AU',    // 澳洲
  'ANZ',   // 紐澳
  'ID',    // 印尼
  'IN',    // 印度
  'KH',    // 柬埔寨
  'TR',    // 土耳其
  'AE',    // 阿聯酋
  '波斯灣', // 波斯灣
  'SA',    // 沙烏地阿拉伯
  'RU',    // 俄羅斯
  'GU',    // 塞班、關島
  'LA',    // 寮國
  'MN',    // 蒙古
  'LK',    // 斯里蘭卡
  'BD',    // 孟加拉
  'MA',    // 摩洛哥
  'SAM',   // 南美
  'AFR',   // 非洲
]

const ORDER_INDEX = new Map(COUNTRY_DISPLAY_ORDER.map((code, i) => [code, i]))

/** 依業主指定順序排序國家清單；未列到的排最後、保持原相對順序（stable sort）。 */
export function sortByCountryOrder<T extends { countryCode: string }>(list: T[]): T[] {
  const rank = (code: string) => ORDER_INDEX.get(code) ?? Number.MAX_SAFE_INTEGER
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (rank(a.c.countryCode) - rank(b.c.countryCode)) || (a.i - b.i))
    .map(x => x.c)
}
