import { NextRequest, NextResponse } from 'next/server'
import { getActiveProducts, getAvailableCountries } from '@/lib/services/product'
import { resolveViewerMember } from '@/lib/auth/viewer'

// GET /api/products?country=JP
// 已核准企業會員回傳福利價（benefitPrice）；非會員只回一般售價。
export async function GET(req: NextRequest) {
  const countryCode = req.nextUrl.searchParams.get('country') ?? undefined

  const [{ isMember }, products, countries] = await Promise.all([
    resolveViewerMember(req),
    getActiveProducts(countryCode),
    getAvailableCountries(),
  ])

  // 非會員不回傳福利價（避免外洩企業價）
  const shaped = isMember ? products : products.map(({ benefitPrice: _b, ...rest }) => rest)

  return NextResponse.json({ products: shaped, countries, isMember })
}
