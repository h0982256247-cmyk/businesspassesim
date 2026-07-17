import { NextRequest, NextResponse } from 'next/server'
import { getCountriesWithMinPrice } from '@/lib/services/product'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { resolveTenantAdminIdFromToken } from '@/lib/auth/resolve-tenant'

// GET /api/countries — 主頁「熱門目的地」用：只回國家 + 各國最低價（輕量，不撈全部商品）
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const tenantAdminId = await resolveTenantAdminIdFromToken(token)
  const countries = await getCountriesWithMinPrice(tenantAdminId)
  return NextResponse.json({ countries })
}
