import type { TenantConfig, TenantColors } from '@/components/liff/TenantContext'

export interface HomeCountry {
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string | null
  minPrice: number | null
}

export interface HomePageProps {
  tenant: TenantConfig | null
  slug: string
  countries: HomeCountry[]
  colors: TenantColors
  showSetup: boolean
  onDismissSetup: () => void
  onSelectCountry: (code: string) => void
  onNavigate: (path: string) => void
  onSearch: (query: string) => void
}
