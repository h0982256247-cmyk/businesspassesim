import { NextRequest, NextResponse } from 'next/server'
import { getProductById } from '@/lib/services/product'
import { SESSION_COOKIE } from '@/lib/auth/session'
import { resolveTenantAdminIdFromToken } from '@/lib/auth/resolve-tenant'

// GET /api/products/:id
// 多租戶隔離：依登入者租戶查商品；非本租戶（或已下架/供應商停用）一律當作不存在。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantAdminId = await resolveTenantAdminIdFromToken(req.cookies.get(SESSION_COOKIE)?.value)
  const product = await getProductById(id, tenantAdminId)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json({ product })
}
