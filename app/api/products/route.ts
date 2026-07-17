import { NextRequest, NextResponse } from 'next/server'
import { getActiveProducts, getAvailableCountries } from '@/lib/services/product'

// GET /api/products?country=JP
export async function GET(req: NextRequest) {
  const countryCode = req.nextUrl.searchParams.get('country') ?? undefined

  const [products, countries] = await Promise.all([
    getActiveProducts(countryCode),
    getAvailableCountries(),
  ])

  return NextResponse.json({ products, countries })
}
