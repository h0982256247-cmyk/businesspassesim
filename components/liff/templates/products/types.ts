import type { TenantColors } from '@/components/liff/TenantContext'

export interface Country {
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string | null
  imageUrl?: string | null // 後台上傳的國家圖（覆寫內建預設）；空＝退回 dest-image.ts
}

export interface Product {
  id: string
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  displayDays: number
  dataCapacity: string | null
  coverageCountries: string | null
  networkType: string | null
  isNativeSim: boolean
  description: string | null
  sellPrice: number
  /** 企業福利價：僅已核准企業會員的 API 回應會帶；有值且 < sellPrice 時顯示「原價槓掉 + 福利價」。 */
  benefitPrice?: number
}

// 方案/天數雙下拉（互相交叉過濾）：選項本身就排除不相容組合。
export interface DayFilterControls {
  /** 目前選的天數；0 = 全部天數。 */
  dayFilter: number
  /** 可選天數（依已選方案類型交叉過濾，升冪）；0(全部) 由 UI 自行加。 */
  availableDays: number[]
  /** 選天數；傳 0 表示全部。 */
  onDay: (n: number) => void
  /** 目前選的方案類型（總量 / 每日型 / 吃到飽）；null = 全部。 */
  dataType: string | null
  /** 可選方案類型（依已選天數交叉過濾）。 */
  availableDataTypes: string[]
  /** 切換方案類型；傳 null 表示全部。 */
  onDataType: (t: string | null) => void
  /** 符合目前兩個篩選的方案數。 */
  filteredCount: number
  /** 此目的地全部方案數。 */
  totalCount: number
}

export interface CartControls {
  has: (productId: string) => boolean
  /** Toggles cart membership. Parent handles country lookup + persistence. */
  toggle: (product: Product) => void
}

export interface ProductsTemplateProps {
  slug: string
  countries: Country[]
  /** Products to render — already filtered by `filter.dayFilter` when active. */
  products: Product[]
  /** 全量方案（未經天數/流量篩選）：國家清單搜尋掃「適用國家」用，避免漏掉被日篩濾掉的目的地。 */
  allProducts?: Product[]
  /** 該目的地「適用國家」原字串（取自未經天數篩選的整組方案，避免被日篩濾掉）。 */
  coverageCountries: string | null
  selectedCountry: string | null
  showSetup: boolean
  colors: TenantColors
  logoUrl: string | null
  shopHeroUrl?: string | null // 商城頂端圖（後台上傳；空＝品牌漸層底）
  onSelectCountry: (code: string) => void
  onSelectProduct: (id: string) => void
  onDismissSetup: () => void
  onBack: () => void
  filter: DayFilterControls
  cart: CartControls
}
