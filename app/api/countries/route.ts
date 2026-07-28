import { NextRequest, NextResponse } from 'next/server'
import { getCountriesWithMinPrice } from '@/lib/services/product'
import { resolveViewerMember } from '@/lib/auth/viewer'

// GET /api/countries — 主頁「熱門目的地」用：只回國家 + 各國最低價（輕量，不撈全部商品）。
// 已核准企業會員 → 最低「福利價」；非會員 → 最低「一般售價」（與方案卡實際顯示一致）。
export async function GET(req: NextRequest) {
  const { isMember } = await resolveViewerMember(req)
  const countries = await getCountriesWithMinPrice(isMember)
  return NextResponse.json({ countries })
}
