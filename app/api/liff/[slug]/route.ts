import { NextRequest, NextResponse } from 'next/server'
import { getTenantBySlug } from '@/lib/services/tenant'

// GET /api/liff/[slug]
// Public — returns brand config for a tenant LIFF page
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  return NextResponse.json({ tenant })
}
