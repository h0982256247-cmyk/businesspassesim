import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { recomputeMetaFromSupplier } from '@/lib/services/product'

// PgBouncer connection_limit=1 下 bulk UPDATE 仍要花 10-20 秒在 11k+ 列規模上。
// 10 秒預設 timeout 不夠，拉到 60 秒。
export const maxDuration = 60

// POST /api/admin/products/recompute-country
// 用 SupplierProduct.productName / planCode / wmProductId 重新解析所有 Product
// 的「國家」與「流量」欄位。endpoint 路徑保留 country 字樣是相容歷史前端。
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  try {
    const r = await recomputeMetaFromSupplier(auth.tenantAdminId)
    return NextResponse.json({
      message: `重算完成：共 ${r.total} 筆，國家更新 ${r.countryUpdated} 筆，流量更新 ${r.capacityUpdated} 筆`,
      ...r,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '重算失敗'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
