import type { TenantConfig, TenantColors } from '@/components/liff/TenantContext'

export interface HomeCountry {
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string | null
  minPrice: number | null
  imageUrl?: string | null // 後台上傳的國家圖（覆寫內建預設）；空＝退回 dest-image.ts
}

// 主頁搜尋的「適用國家」聯集用：每個方案的所屬國 + 適用國家字串。
// 由背景預抓的 /api/products 導出（見 app/liff/[slug]/page.tsx）。
export interface HomeCoverage {
  countryCode: string
  coverageCountries: string | null
}

export interface HomePageProps {
  tenant: TenantConfig | null
  slug: string
  countries: HomeCountry[]
  /** 搜尋用的適用國家來源；背景商品資料尚未回來前為空陣列（僅退化成純國名比對）。 */
  coverage: HomeCoverage[]
  colors: TenantColors
  showSetup: boolean
  onDismissSetup: () => void
  onSelectCountry: (code: string) => void
  onNavigate: (path: string) => void
  onSearch: (query: string) => void
}
