import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'
import { fetchSupplierProductMap } from '@/lib/services/esim'

interface IssueBase {
  id: string
  skuId: string
  name: string
  countryCode: string
  countryFlag: string
}

interface PriceMismatchIssue extends IssueBase {
  currentCost: number
  supplierCost: number
}

// GET /api/admin/products/validate
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const products = await prisma.product.findMany({
    where: auth.tenantAdminId ? { tenantAdminId: auth.tenantAdminId } : undefined,
    select: {
      id: true,
      costPrice: true,
      countryCode: true,
      countryNameZh: true,
      countryFlag: true,
      displayDays: true,
      supplierProduct: { select: { wmProductId: true, lastSyncAt: true } },
    },
  })

  // 取得最近一次同步時間（用於前端節流提示）
  const lastSyncAt = products
    .map(p => p.supplierProduct?.lastSyncAt)
    .filter((d): d is Date => d !== null && d !== undefined)
    .reduce<Date | null>((max, d) => (max == null || d > max ? d : max), null)

  // 一次取回全部供應商方案清單，再批次比對（避免逐筆呼叫被鎖 IP）
  const supplierMap = await fetchSupplierProductMap(auth.tenantAdminId)

  const notFound: IssueBase[] = []
  const priceMismatch: PriceMismatchIssue[] = []

  for (const product of products) {
    const skuId = product.supplierProduct?.wmProductId ?? ''
    const name = `${product.countryNameZh ?? ''} ${product.displayDays}天`
    const countryFlag = product.countryFlag ?? ''
    const countryCode = product.countryCode ?? ''

    if (!skuId) {
      notFound.push({ id: product.id, skuId: '', name, countryCode, countryFlag })
      continue
    }

    const info = supplierMap.get(skuId)
    if (!info) {
      // 方案不在清單中 → 供應商已移除或未授權
      notFound.push({ id: product.id, skuId, name, countryCode, countryFlag })
    } else if (info.productPrice !== product.costPrice) {
      priceMismatch.push({
        id: product.id,
        skuId,
        name,
        countryCode,
        countryFlag,
        currentCost: product.costPrice,
        supplierCost: info.productPrice,
      })
    }
  }

  const issueCount = notFound.length + priceMismatch.length
  const clean = products.length - issueCount

  return NextResponse.json({
    total: products.length,
    clean,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    issues: {
      notFound,
      inactive:     [],   // myQueryAll 無法區分「下架」與「查無」，統一歸入 notFound
      priceMismatch,
    },
  })
}
