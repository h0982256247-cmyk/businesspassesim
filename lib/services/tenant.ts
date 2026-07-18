import type { TenantConfig } from '@/components/liff/TenantContext'

export type { TenantConfig }

// 單一品牌：原白牌版由 PlatformAdmin 解析 per-tenant 設定（slug/liffId/domain）。
// 改造後只有「商務通」一個品牌，一律回傳同一組 env 設定；保留這些函式簽名讓
// 既有 /liff/[slug] 路由與 TenantContext 不用大改（slug 變常數）。
const BRAND: TenantConfig = {
  id: 'default',
  slug: process.env.NEXT_PUBLIC_BRAND_SLUG || 'app',
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME || '商務通',
  liffId: process.env.NEXT_PUBLIC_LIFF_ID || '',
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO || null,
  primaryColor: process.env.NEXT_PUBLIC_BRAND_COLOR || null,
  homeTemplate: null,
  productsTemplate: null,
  lineOaUrl: process.env.NEXT_PUBLIC_LINE_OA_URL || null,
}

export async function getTenantBySlug(_slug: string): Promise<TenantConfig | null> {
  return BRAND
}

export async function getTenantByLiffId(_liffId: string): Promise<TenantConfig | null> {
  return BRAND
}

export async function getTenantByDomain(_host: string): Promise<TenantConfig | null> {
  return BRAND
}

export async function getTenantById(_id: string): Promise<TenantConfig | null> {
  return BRAND
}
