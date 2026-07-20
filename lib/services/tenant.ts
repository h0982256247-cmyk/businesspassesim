import type { TenantConfig } from '@/components/liff/TenantContext'
import { getPlatformSettings } from './tenant-config'

export type { TenantConfig }

// 單一品牌：品牌設定來源為後台「系統設定」（PlatformSetting），未設定的欄位以 env 補。
// 保留這些函式簽名讓既有 /liff/[slug] 路由與 TenantContext 不用大改（slug 為常數）。
async function brand(): Promise<TenantConfig> {
  const s = await getPlatformSettings()
  return {
    id: 'default',
    slug: process.env.NEXT_PUBLIC_BRAND_SLUG || 'app',
    brandName: s.brandName || process.env.NEXT_PUBLIC_BRAND_NAME || '商務通',
    liffId: s.liffId || process.env.NEXT_PUBLIC_LIFF_ID || '',
    logoUrl: s.logoUrl || process.env.NEXT_PUBLIC_BRAND_LOGO || null,
    primaryColor: s.primaryColor || process.env.NEXT_PUBLIC_BRAND_COLOR || null,
    lineOaUrl: s.lineOaUrl || process.env.NEXT_PUBLIC_LINE_OA_URL || null,
    transferEnabled: s.transferEnabled,
  }
}

export async function getTenantBySlug(_slug: string): Promise<TenantConfig | null> {
  return brand()
}

export async function getTenantByLiffId(_liffId: string): Promise<TenantConfig | null> {
  return brand()
}

export async function getTenantByDomain(_host: string): Promise<TenantConfig | null> {
  return brand()
}

export async function getTenantById(_id: string): Promise<TenantConfig | null> {
  return brand()
}
