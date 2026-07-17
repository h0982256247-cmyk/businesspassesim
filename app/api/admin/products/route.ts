import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllProductsAdmin, upsertProduct } from '@/lib/services/product'

// GET /api/admin/products?page=1&pageSize=100&q=日本
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const tenantAdminId = auth.role === 'PLATFORM_ADMIN' ? auth.tenantAdminId
    : auth.role === 'SUB_ADMIN' ? auth.tenantAdminId
    : null  // SUPER_ADMIN gets empty list (shouldn't be here)

  const page     = parseInt(req.nextUrl.searchParams.get('page')     ?? '1') || 1
  const pageSize = parseInt(req.nextUrl.searchParams.get('pageSize') ?? '100') || 100
  const q        = req.nextUrl.searchParams.get('q') ?? undefined

  const result = await getAllProductsAdmin({ tenantAdminId, page, pageSize, q })
  return NextResponse.json(result)
}

// POST /api/admin/products — single create
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const product = await upsertProduct(undefined, { ...body, tenantAdminId: auth.tenantAdminId })
  return NextResponse.json({ product }, { status: 201 })
}
