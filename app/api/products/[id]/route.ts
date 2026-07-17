import { NextRequest, NextResponse } from 'next/server'
import { getProductById } from '@/lib/services/product'

// GET /api/products/:id
// 已下架 / 供應商停用一律當作不存在。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProductById(id)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json({ product })
}
