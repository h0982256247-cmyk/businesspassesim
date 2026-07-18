import { NextRequest, NextResponse } from 'next/server'
import { getProductById } from '@/lib/services/product'
import { resolveViewerMember } from '@/lib/auth/viewer'

// GET /api/products/:id
// 已下架 / 供應商停用一律當作不存在。已核准企業會員回傳福利價。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [{ isMember }, product] = await Promise.all([
    resolveViewerMember(req),
    getProductById(id),
  ])

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // 內部欄位（成本、供應商 SKU）不外洩；福利價只給已核准企業會員。
  const { costPrice: _cost, supplierSkuId: _sku, benefitPrice, ...pub } = product
  const shaped = isMember ? { ...pub, benefitPrice } : pub

  return NextResponse.json({ product: shaped, isMember })
}
