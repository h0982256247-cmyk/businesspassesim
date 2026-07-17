// Country / region name resolution shared by CSV import and the admin
// "recompute countries" tool. Two flavours of identifier coexist on purpose:
//   - ISO 3166-1 alpha-2 (JP, US, TH …) for single countries
//   - custom 3-letter codes (SEA, ANZ, NMY …) for multi-country bundles
//     the merchant carves out in the back office.

export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  // 亞洲
  '日本': 'JP', '韓國': 'KR', '南韓': 'KR', '北韓': 'KP',
  '台灣': 'TW', '中國': 'CN', '中國大陸': 'CN',
  '香港': 'HK', '澳門': 'MO', '澳门': 'MO',
  '新加坡': 'SG', '馬來西亞': 'MY', '马来西亚': 'MY',
  '泰國': 'TH', '越南': 'VN', '印尼': 'ID', '菲律賓': 'PH', '菲律宾': 'PH',
  '柬埔寨': 'KH', '寮國': 'LA', '寮国': 'LA', '緬甸': 'MM', '缅甸': 'MM',
  '印度': 'IN', '巴基斯坦': 'PK', '孟加拉': 'BD', '斯里蘭卡': 'LK', '斯里兰卡': 'LK',
  '尼泊爾': 'NP', '尼泊尔': 'NP', '不丹': 'BT', '馬爾地夫': 'MV',
  '蒙古': 'MN', '哈薩克': 'KZ', '哈萨克': 'KZ', '烏茲別克': 'UZ', '吉爾吉斯': 'KG',
  '土耳其': 'TR', '以色列': 'IL', '阿聯': 'AE', '阿联酋': 'AE', '沙烏地阿拉伯': 'SA',
  '伊朗': 'IR', '伊拉克': 'IQ', '約旦': 'JO', '黎巴嫩': 'LB', '卡達': 'QA', '卡塔尔': 'QA',
  // 歐洲
  '英國': 'GB', '英国': 'GB', '法國': 'FR', '德國': 'DE', '德国': 'DE',
  '義大利': 'IT', '意大利': 'IT', '西班牙': 'ES', '葡萄牙': 'PT',
  '荷蘭': 'NL', '荷兰': 'NL', '比利時': 'BE', '盧森堡': 'LU', '瑞士': 'CH', '奧地利': 'AT',
  '瑞典': 'SE', '挪威': 'NO', '丹麥': 'DK', '芬蘭': 'FI', '冰島': 'IS',
  '愛爾蘭': 'IE', '波蘭': 'PL', '捷克': 'CZ', '匈牙利': 'HU', '希臘': 'GR',
  '俄羅斯': 'RU', '俄罗斯': 'RU', '烏克蘭': 'UA',
  '羅馬尼亞': 'RO', '保加利亞': 'BG', '克羅埃西亞': 'HR', '塞爾維亞': 'RS',
  // 美洲
  '美國': 'US', '美国': 'US', '加拿大': 'CA', '墨西哥': 'MX',
  '巴西': 'BR', '阿根廷': 'AR', '智利': 'CL', '哥倫比亞': 'CO', '秘魯': 'PE',
  // 南美（多國 region：對應供應商「南美」整區方案，顯示用 globe 圖示，比照非洲 AFR）
  '南美': 'SAM', '南美洲': 'SAM', '南美州': 'SAM',
  // 非洲（單國）
  '南非': 'ZA', '埃及': 'EG', '摩洛哥': 'MA', '肯亞': 'KE', '奈及利亞': 'NG',
  // 非洲（多國 region：對應 supplier SKU 的 AFR/AFR-A/AFR-B... 各 zone）
  '非洲': 'AFR', '非州': 'AFR',
  // 大洋洲
  '澳洲': 'AU', '澳大利亞': 'AU', '紐西蘭': 'NZ', '新西兰': 'NZ',
  '斐濟': 'FJ', '關島': 'GU',
  // 多國／區域方案（自訂 code）
  '紐澳': 'ANZ', '澳紐': 'ANZ',
  '東南亞': 'SEA', '东南亚': 'SEA',
  '港澳': 'HKM',
  '兩岸三地': 'CNT', '中港台': 'CNT', '中港澳': 'CNT',
  '歐洲': 'EU', '欧洲': 'EU',
  '中東': 'MEA', '中东': 'MEA',
  '全球': 'WW', '世界': 'WW',
  // 商家常用的雙國組合（自訂 code）
  '新馬': 'NMY', '马新': 'NMY', '馬新': 'NMY',
  '日韓': 'JPK', '韓日': 'JPK', '韩日': 'JPK',
  '中港': 'CNHK',
  '中台': 'CNTW',
  '美加': 'USCA', '加美': 'USCA',
  '台日': 'TWJP', '日台': 'TWJP',
  '台韓': 'TWKR', '韓台': 'TWKR',
}

// Keys pre-sorted longest first so 「東南亞」 beats 「亞」 in substring match.
const COUNTRY_NAME_KEYS = Object.keys(COUNTRY_NAME_TO_CODE).sort((a, b) => b.length - a.length)

// code → 標準中文名（取每個 code 第一個出現的 zh key），用於從 country code
// 反查顯示用中文名（例如：用 explicit 'TH' 顯示「泰國」而非錯誤的「東南亞」）。
export const CODE_TO_NAME_ZH: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [zh, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (!out[code]) out[code] = zh
  }
  return out
})()

export function countryNameToCode(name: string): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return COUNTRY_NAME_TO_CODE[trimmed] ?? null
}

// 在任意字串中找出最先出現的國家／區域名稱。例如：
//   「日本Softbank」 → { code: 'JP', zh: '日本' }
//   「東南亞7國方案」 → { code: 'SEA', zh: '東南亞' }
export function matchCountryInText(text: string): { code: string; zh: string } | null {
  if (!text) return null
  for (const key of COUNTRY_NAME_KEYS) {
    if (text.includes(key)) return { code: COUNTRY_NAME_TO_CODE[key], zh: key }
  }
  return null
}

// 商品名稱拆段。範例：「美國, 10天, 3GB/天」→ { country: "美國", days: 10 }
export function parseProductNameSegments(name: string): { country?: string; days?: number } {
  if (!name) return {}
  const parts = name.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return {}
  const country = parts[0] || undefined
  let days: number | undefined
  for (const seg of parts.slice(1)) {
    const m = seg.match(/(\d+)\s*[天日]/)
    if (m) { days = parseInt(m[1]); break }
  }
  return { country, days }
}

// ISO 3166-1 alpha-2 → 國旗 emoji（Regional Indicator）
// 對自訂 3 字母代碼（SEA / NMY / …）回傳空字串，由 UI 自己 fallback。
export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return ''
  const [a, b] = code.toUpperCase().split('')
  const toRI = (c: string) => String.fromCodePoint(c.codePointAt(0)! + 127397)
  return toRI(a) + toRI(b)
}

// Plan code 前綴 → 標準中文國名。商家自訂 plan code 規則差異很大，這張表混了：
//   - ISO 3166-1 alpha-3（JPN/KOR/THA/...）
//   - 商家自己用的縮寫（IND=印尼/SGMA=新馬）
//   - 自訂多國 region 代碼（NMY/SEA/ANZ ...）
// 之後新格式增加直接補在這裡即可。
const PLAN_CODE_PREFIX_TO_NAME: Record<string, string> = {
  // 商家觀察到的自訂縮寫（從 CSV 截圖）
  IND: '印尼',   // 注意：ISO3 IND 是印度，但本商家用來代表印尼
  IDN: '印尼',
  SGMA: '新馬',
  // ISO 3166-1 alpha-3 標準
  JPN: '日本',  KOR: '韓國',  TWN: '台灣',  CHN: '中國',
  HKG: '香港',  MAC: '澳門',  SGP: '新加坡', MYS: '馬來西亞',
  THA: '泰國',  VNM: '越南',  PHL: '菲律賓',
  KHM: '柬埔寨', LAO: '寮國',  MMR: '緬甸',
  PAK: '巴基斯坦', BGD: '孟加拉', LKA: '斯里蘭卡', NPL: '尼泊爾',
  TUR: '土耳其', ISR: '以色列', ARE: '阿聯', SAU: '沙烏地阿拉伯',
  GBR: '英國',  FRA: '法國',  DEU: '德國',  ITA: '義大利',
  ESP: '西班牙', PRT: '葡萄牙', NLD: '荷蘭',  BEL: '比利時',
  CHE: '瑞士',  AUT: '奧地利', SWE: '瑞典',  NOR: '挪威',
  DNK: '丹麥',  FIN: '芬蘭',  ISL: '冰島',  IRL: '愛爾蘭',
  POL: '波蘭',  CZE: '捷克',  HUN: '匈牙利', GRC: '希臘',
  RUS: '俄羅斯', UKR: '烏克蘭',
  USA: '美國',  CAN: '加拿大', MEX: '墨西哥', BRA: '巴西',
  ARG: '阿根廷', CHL: '智利',  COL: '哥倫比亞', PER: '秘魯',
  ZAF: '南非',  EGY: '埃及',  MAR: '摩洛哥', KEN: '肯亞',
  AUS: '澳洲',  NZL: '紐西蘭',
}

// 預先排序：先試長的前綴避免「SGMA」被「SG」誤匹配
const PLAN_CODE_PREFIXES = Object.keys(PLAN_CODE_PREFIX_TO_NAME).sort((a, b) => b.length - a.length)

// 從 planCode 開頭抓國家／區域代碼。例如：
//   「IND-TI-1D」 → { code: 'ID', zh: '印尼' }   (查 PLAN_CODE_PREFIX_TO_NAME)
//   「TH-T50-30D」 → { code: 'TH', zh: '泰國' }  (2 字母 ISO)
//   「NMY-TI-1D」 → { code: 'NMY', zh: '新馬' }  (3 字母自訂 region)
// 找不到回傳 null，讓呼叫端 fallback 其他資訊。
export function resolveCountryByPlanCode(
  planCode: string,
): { code: string; zh: string; flag: string } | null {
  if (!planCode) return null
  const upper = planCode.toUpperCase()

  // 1. 商家自訂前綴 / ISO3（長前綴優先）
  for (const prefix of PLAN_CODE_PREFIXES) {
    if (upper.startsWith(prefix + '-') || upper === prefix) {
      const zh = PLAN_CODE_PREFIX_TO_NAME[prefix]
      const code = COUNTRY_NAME_TO_CODE[zh]
      if (code) return { code, zh, flag: countryCodeToFlag(code) }
    }
  }

  // 2. 開頭 3 字母直接命中 CODE_TO_NAME_ZH（例如自訂 region NMY/SEA/ANZ）
  const m3 = upper.match(/^([A-Z]{3})-/)
  if (m3 && CODE_TO_NAME_ZH[m3[1]]) {
    return { code: m3[1], zh: CODE_TO_NAME_ZH[m3[1]], flag: countryCodeToFlag(m3[1]) }
  }

  // 3. 開頭 2 字母 ISO（TH/JP/KR/...）
  const m2 = upper.match(/^([A-Z]{2})-/)
  if (m2 && CODE_TO_NAME_ZH[m2[1]]) {
    return { code: m2[1], zh: CODE_TO_NAME_ZH[m2[1]], flag: countryCodeToFlag(m2[1]) }
  }

  return null
}

// 從商品名稱（C 欄）+ CSV 各欄位解析出「顯示國家/區域」。業主定案 2026-06：
//   - 顯示名一律取 **C 欄商品名稱的前段**（逗號前第 1 段），如「西歐」「日本」「中歐/東歐/巴爾幹」。
//   - 前段是「單一國家」（抓到的關鍵字對應 2 碼 ISO）→ countryCode 用 ISO，前台顯示該國國旗。
//   - 前段是「區域/多國/無法辨識」（如 西歐、南美、歐洲C、紐澳）→ countryCode 直接用「顯示名」，
//     使每個區域各自成為獨立目的地（前台依 countryCode 分組），且 CountryFlag 因 code 非 ISO 顯示地球。
//   - 前段為空才退回 CSV 國碼/適用地區欄兜底。
export function resolveCountry(
  productName: string,
  csvCountryCode: string,
  csvCountryNameZh: string,
  csvCountryNameEn: string,
  csvCountryFlag: string,
): {
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string
  matchedByName: boolean
} {
  const nameSegs = parseProductNameSegments(productName)
  const front = (nameSegs.country ?? '').trim()      // C 欄前段
  const explicitCode = csvCountryCode.trim().toUpperCase()
  const explicitIsIso = /^[A-Z]{2}$/.test(explicitCode)

  // 是否為單一國家：抓到的關鍵字對應 2 碼 ISO（自訂多國代碼 EU/SAM/SEA/AFR… 不算）
  const hit = matchCountryInText(front) ?? matchCountryInText(productName)
  const isSingleCountry = !!hit && /^[A-Z]{2}$/.test(hit.code)

  // 顯示名：優先 C 欄前段；前段空才退回 explicit ISO 的標準中文名 / CSV 適用地區
  const countryNameZh =
    front
    || (explicitIsIso ? (CODE_TO_NAME_ZH[explicitCode] ?? '') : '')
    || csvCountryNameZh.trim()
    || ''

  // 分組鍵 countryCode：單一國家→ISO；CSV 明確 ISO→該 ISO；其餘區域→顯示名（各自成組 + 地球）
  let countryCode: string
  if (isSingleCountry) countryCode = hit!.code
  else if (explicitIsIso) countryCode = explicitCode
  else countryCode = countryNameZh

  // 旗標：單一國家用 ISO emoji 備援；區域一律留空 → 前端 CountryFlag 顯示地球
  const countryFlag = isSingleCountry
    ? (csvCountryFlag || countryCodeToFlag(countryCode) || '')
    : ''

  return {
    countryCode,
    countryNameZh,
    countryNameEn: csvCountryNameEn,
    countryFlag,
    // 有抓到前段就視為「已決定國家/區域」，匯入 POST 階段不再用供應商名覆蓋
    matchedByName: !!front,
  }
}
