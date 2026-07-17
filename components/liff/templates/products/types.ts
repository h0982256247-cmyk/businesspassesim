import type { TenantColors } from '@/components/liff/TenantContext'
import type { CouponItem } from '@/lib/utils/coupon-combo'

export interface Country {
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string | null
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
}

export interface DayFilterControls {
  /** Current value shown in the picker (1 when no filter is active). */
  pickerDays: number
  /** Active filter value; 0 means no filter is applied. */
  dayFilter: number
  /** Sorted list of `displayDays` values available across all products. */
  availableDays: number[]
  /** Preset chip values to surface in the picker. */
  presets: number[]
  minDay: number
  maxDay: number
  onChange: (n: number) => void
  onClear: () => void
  /** Plans matching the active filter (the value the template should render). */
  filteredCount: number
  totalCount: number
  /** Up to 3 nearest available day counts to suggest when no exact match. */
  nearestDays: number[]
  /** 流量類型篩選（對應主頁搜尋）：'總量' | '每日型' | '吃到飽'；null = 全部。 */
  dataType: string | null
  /** 可選的流量類型按鈕。 */
  dataOptions: string[]
  /** 切換流量類型；傳 null 表示「全部」。 */
  onDataType: (t: string | null) => void
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
  /** 該目的地「適用國家」原字串（取自未經天數篩選的整組方案，避免被日篩濾掉）。 */
  coverageCountries: string | null
  coupons: CouponItem[]
  selectedCountry: string | null
  showSetup: boolean
  colors: TenantColors
  logoUrl: string | null
  onSelectCountry: (code: string) => void
  onSelectProduct: (id: string) => void
  onDismissSetup: () => void
  onBack: () => void
  filter: DayFilterControls
  cart: CartControls
}
