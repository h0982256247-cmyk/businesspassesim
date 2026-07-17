import { prisma } from '@/lib/db/prisma'
import type { TenantConfig } from '@/components/liff/TenantContext'

export type { TenantConfig }

export async function getTenantBySlug(slug: string): Promise<TenantConfig | null> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { tenantSlug: slug, isActive: true },
    select: { id: true, tenantSlug: true, brandName: true, liffId: true, logoUrl: true, primaryColor: true, homeTemplate: true, productsTemplate: true, lineOaUrl: true },
  })

  if (!admin || !admin.tenantSlug || !admin.brandName || !admin.liffId) return null

  return {
    id: admin.id,
    slug: admin.tenantSlug,
    brandName: admin.brandName,
    liffId: admin.liffId,
    logoUrl: admin.logoUrl,
    primaryColor: admin.primaryColor,
    homeTemplate: (admin.homeTemplate as TenantConfig['homeTemplate']) ?? null,
    productsTemplate: (admin.productsTemplate as TenantConfig['productsTemplate']) ?? null,
    lineOaUrl: admin.lineOaUrl,
  }
}

// 非 slug 的單租戶部署（用環境變數 NEXT_PUBLIC_LIFF_ID 綁定）靠 liffId 反查後台
// 品牌設定，用來設定頁面標題等。liffId 理論上對應單一後台，取第一筆即可。
export async function getTenantByLiffId(liffId: string): Promise<TenantConfig | null> {
  if (!liffId) return null
  const admin = await prisma.platformAdmin.findFirst({
    where: { liffId, isActive: true },
    select: { id: true, tenantSlug: true, brandName: true, liffId: true, logoUrl: true, primaryColor: true, homeTemplate: true, productsTemplate: true, lineOaUrl: true },
  })

  if (!admin || !admin.tenantSlug || !admin.brandName || !admin.liffId) return null

  return {
    id: admin.id,
    slug: admin.tenantSlug,
    brandName: admin.brandName,
    liffId: admin.liffId,
    logoUrl: admin.logoUrl,
    primaryColor: admin.primaryColor,
    homeTemplate: (admin.homeTemplate as TenantConfig['homeTemplate']) ?? null,
    productsTemplate: (admin.productsTemplate as TenantConfig['productsTemplate']) ?? null,
    lineOaUrl: admin.lineOaUrl,
  }
}

// 以 hostname 解析租戶（自訂網域入口）。傳入 Host header（可能含 port），
// 正規化為小寫純 host 後查 TenantDomain。命中才回傳，否則 null（交由 slug 入口處理）。
export async function getTenantByDomain(host: string): Promise<TenantConfig | null> {
  const domain = host.toLowerCase().split(':')[0].trim()
  if (!domain) return null
  const row = await prisma.tenantDomain.findUnique({
    where: { domain },
    select: {
      admin: {
        select: { id: true, isActive: true, tenantSlug: true, brandName: true, liffId: true, logoUrl: true, primaryColor: true, homeTemplate: true, productsTemplate: true, lineOaUrl: true },
      },
    },
  })
  const admin = row?.admin
  if (!admin || !admin.isActive || !admin.tenantSlug || !admin.brandName || !admin.liffId) return null

  return {
    id: admin.id,
    slug: admin.tenantSlug,
    brandName: admin.brandName,
    liffId: admin.liffId,
    logoUrl: admin.logoUrl,
    primaryColor: admin.primaryColor,
    homeTemplate: (admin.homeTemplate as TenantConfig['homeTemplate']) ?? null,
    productsTemplate: (admin.productsTemplate as TenantConfig['productsTemplate']) ?? null,
    lineOaUrl: admin.lineOaUrl,
  }
}

export async function getTenantById(tenantAdminId: string): Promise<TenantConfig | null> {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: tenantAdminId, isActive: true },
    select: { id: true, tenantSlug: true, brandName: true, liffId: true, logoUrl: true, primaryColor: true, homeTemplate: true, productsTemplate: true, lineOaUrl: true },
  })

  if (!admin || !admin.tenantSlug || !admin.brandName || !admin.liffId) return null

  return {
    id: admin.id,
    slug: admin.tenantSlug,
    brandName: admin.brandName,
    liffId: admin.liffId,
    logoUrl: admin.logoUrl,
    primaryColor: admin.primaryColor,
    homeTemplate: (admin.homeTemplate as TenantConfig['homeTemplate']) ?? null,
    productsTemplate: (admin.productsTemplate as TenantConfig['productsTemplate']) ?? null,
    lineOaUrl: admin.lineOaUrl,
  }
}
