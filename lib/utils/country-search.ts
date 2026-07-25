// 目的地搜尋的單一來源：商城國家列表與主頁搜尋共用同一套比對規則，
// 避免兩處各寫一份而行為走鐘（例：主頁不會「打日出日本」、也不吃適用國家）。

/** 比對只需要國名兩欄；商城 Country 與主頁 HomeCountry 都相容。 */
export interface SearchableCountry {
  countryCode: string
  countryNameZh: string
  countryNameEn: string
}

/** 提供「適用國家」字串的來源（通常是方案 Product）；只取這兩個欄位。 */
export interface CoverageSource {
  countryCode: string
  coverageCountries?: string | null
}

// 正規化查詢字：
// 去掉注音符號與聲調（IME 組字途中的「ㄖ」「ㄖˋ」等 marked text），避免選字前
// 整格被誤判成「找不到」；選完字（如「日」）立即比對。再 trim + 轉小寫。
export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/[ㄅ-ㄯㆠ-ㆿˊˇˋ˙]/g, '').trim().toLowerCase()
}

// 依查詢字篩選目的地：「國名（中/英）命中」與「某方案的適用國家字串命中該國」取聯集。
// 打「香港」時，香港本身與涵蓋香港的中港澳等目的地都要出現。
// coverageSource 建議傳「全量方案」（未經天數篩選）——只傳當前篩選結果會漏掉
// 沒有該天數方案的目的地。空查詢回傳原清單（不動順序）。
export function filterCountriesByQuery<C extends SearchableCountry>(
  countries: C[],
  query: string,
  coverageSource: readonly CoverageSource[],
): C[] {
  const q = normalizeSearchQuery(query)
  if (!q) return countries

  const byCoverage = new Set<string>()
  for (const p of coverageSource) {
    if (p.coverageCountries?.toLowerCase().includes(q)) byCoverage.add(p.countryCode)
  }

  return countries.filter(c =>
    c.countryNameZh.toLowerCase().includes(q) ||
    c.countryNameEn.toLowerCase().includes(q) ||
    byCoverage.has(c.countryCode))
}
