import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/tenant/:slug — 公開端點，回傳品牌設定（LIFF App 初始化用）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const admin = await prisma.platformAdmin.findUnique({
    where: { tenantSlug: slug },
    select: {
      id: true,
      brandName: true,
      logoUrl: true,
      primaryColor: true,
      tenantSlug: true,
    },
  })

  if (!admin) {
    return NextResponse.json({ error: '找不到此租戶' }, { status: 404 })
  }

  return NextResponse.json({
    tenantAdminId: admin.id,
    brandName: admin.brandName,
    logoUrl: admin.logoUrl,
    primaryColor: admin.primaryColor ?? '#3B82F6',
    tenantSlug: admin.tenantSlug,
  })
}
