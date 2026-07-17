import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { upsertProduct, setProductStatus } from '@/lib/services/product'
import { ProductStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/products/:id — update fields or status
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = await req.json()

  // Verify ownership for non-SUPER_ADMIN
  if (auth.role !== 'SUPER_ADMIN') {
    const existing = await prisma.product.findUnique({ where: { id }, select: { tenantAdminId: true } })
    if (!existing) return NextResponse.json({ error: '商品不存在' }, { status: 404 })
    if (existing.tenantAdminId !== auth.tenantAdminId) {
      return NextResponse.json({ error: '無權操作此商品' }, { status: 403 })
    }
  }

  // Status-only update
  if (body.status && Object.keys(body).length === 1) {
    if (!Object.values(ProductStatus).includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    const product = await setProductStatus(id, body.status as ProductStatus)
    return NextResponse.json({ product })
  }

  const product = await upsertProduct(id, body)
  return NextResponse.json({ product })
}
