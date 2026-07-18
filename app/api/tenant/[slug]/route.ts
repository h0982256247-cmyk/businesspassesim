import { NextRequest, NextResponse } from 'next/server'
import { getTenantBySlug } from '@/lib/services/tenant'

// GET /api/tenant/:slug — 公開端點，回傳品牌設定（LIFF App 初始化用）。
// 單一品牌：一律回傳「商務通」品牌設定（見 lib/services/tenant.ts）。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getTenantBySlug(slug)
  if (!t) return NextResponse.json({ error: '找不到品牌設定' }, { status: 404 })

  return NextResponse.json({
    tenantAdminId: t.id,
    brandName: t.brandName,
    logoUrl: t.logoUrl,
    primaryColor: t.primaryColor ?? '#3B82F6',
    tenantSlug: t.slug,
  })
}
