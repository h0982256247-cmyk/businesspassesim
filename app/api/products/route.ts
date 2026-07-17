import { NextRequest, NextResponse } from 'next/server'
import { getActiveProducts, getAvailableCountries } from '@/lib/services/product'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { resolveTenantAdminIdFromToken } from '@/lib/auth/resolve-tenant'

// GET /api/products?country=JP
export async function GET(req: NextRequest) {
  const countryCode = req.nextUrl.searchParams.get('country') ?? undefined
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const tenantAdminId = await resolveTenantAdminIdFromToken(token)

  const [products, countries] = await Promise.all([
    getActiveProducts(countryCode, tenantAdminId),
    getAvailableCountries(tenantAdminId),
  ])

  return NextResponse.json({ products, countries })
}
