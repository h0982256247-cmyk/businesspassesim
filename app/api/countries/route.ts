import { NextResponse } from 'next/server'
import { getCountriesWithMinPrice } from '@/lib/services/product'

// GET /api/countries — 主頁「熱門目的地」用：只回國家 + 各國最低價（輕量，不撈全部商品）
export async function GET() {
  const countries = await getCountriesWithMinPrice()
  return NextResponse.json({ countries })
}
