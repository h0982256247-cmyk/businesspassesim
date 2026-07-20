import { prisma } from '@/lib/db/prisma'
import { Prisma, ProductStatus, SupplierProductStatus, SupplierProductType } from '@prisma/client'
import type { SupplierProductMap } from './esim'
import { sellPriceForCostChange, benefitPriceFromCost, DEFAULT_MARGIN_GUARD, DEFAULT_BENEFIT_MARKUP, type MarginGuard } from '@/lib/utils/pricing'
import { getPlatformSettings } from './tenant-config'

export async function getActiveProducts(countryCode?: string) {
  return prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      // 雙重保險：供應商側下架的方案也不應出現在前台
      supplierProduct: { status: SupplierProductStatus.ACTIVE },
      ...(countryCode ? { countryCode } : {}),
    },
    orderBy: [{ countryCode: 'asc' }, { displayDays: 'asc' }],
    select: {
      id: true,
      countryCode: true,
      countryNameZh: true,
      countryNameEn: true,
      countryFlag: true,
      displayDays: true,
      dataCapacity: true,
      coverageCountries: true,
      networkType: true,
      isNativeSim: true,
      description: true,
      sellPrice: true,
      benefitPrice: true, // 企業福利價；route 依身分決定是否回傳
      sortOrder: true,
    },
  })
}

// 購買/查詢單一商品：要求 status=ACTIVE 且 supplierProduct=ACTIVE（不可買下架品）。
export async function getProductById(id: string) {
  return prisma.product.findFirst({
    where: {
      id,
      status: ProductStatus.ACTIVE,
      supplierProduct: { status: SupplierProductStatus.ACTIVE },
    },
    select: {
      id: true,
      countryCode: true,
      countryNameZh: true,
      countryNameEn: true,
      countryFlag: true,
      displayDays: true,
      dataCapacity: true,
      networkType: true,
      isNativeSim: true,
      description: true,
      sellPrice: true,
      benefitPrice: true, // 企業會員成交價；下單時寫入 OrderItem.unitBenefit 快照
      costPrice: true,    // 下單時寫入 OrderItem.unitCost 作為成本快照
      status: true,
      supplierSkuId: true,
    },
  })
}

export async function getAvailableCountries() {
  const products = await prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      supplierProduct: { status: SupplierProductStatus.ACTIVE },
    },
    select: {
      countryCode: true,
      countryNameZh: true,
      countryNameEn: true,
      countryFlag: true,
    },
    distinct: ['countryCode'],
    orderBy: { sortOrder: 'asc' },
  })
  return products
}

// 主頁「熱門目的地」專用：只回國家清單 + 各國最低售價（約數十筆），不撈全部商品。
// 原本主頁打 /api/products（上萬筆）只為了算每國最低價，載入很慢；改用此聚合查詢。
export async function getCountriesWithMinPrice() {
  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.ACTIVE,
    supplierProduct: { status: SupplierProductStatus.ACTIVE },
  }
  const [countries, mins] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { countryCode: true, countryNameZh: true, countryNameEn: true, countryFlag: true },
      distinct: ['countryCode'],
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.product.groupBy({
      by: ['countryCode'],
      where,
      _min: { sellPrice: true },
    }),
  ])
  const minMap = new Map(mins.map(m => [m.countryCode, m._min.sellPrice]))
  return countries.map(c => ({ ...c, minPrice: minMap.get(c.countryCode) ?? null }))
}

// ─── Admin operations ────────────────────────────────────────────

export interface GetAllProductsAdminOptions {
  page?: number      // 1-based
  pageSize?: number  // default 100
  q?: string         // 跨欄位搜尋（國家名/代碼/供應商 SKU/流量）
}

export async function getAllProductsAdmin(opts: GetAllProductsAdminOptions = {}) {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(500, Math.max(1, opts.pageSize ?? 100))
  const q = opts.q?.trim()

  // Prisma where 條件組合
  const where: import('@prisma/client').Prisma.ProductWhereInput = {
    ...(q
      ? {
          OR: [
            { countryNameZh: { contains: q, mode: 'insensitive' } },
            { countryNameEn: { contains: q, mode: 'insensitive' } },
            { countryCode:   { contains: q, mode: 'insensitive' } },
            { dataCapacity:  { contains: q, mode: 'insensitive' } },
            { planCode:      { contains: q, mode: 'insensitive' } },
            { supplierProduct: { wmProductId: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ countryCode: 'asc' }, { displayDays: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        supplierProduct: {
          select: { wmProductId: true, productName: true, status: true, lastSyncAt: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ])

  return { products, total, page, pageSize }
}

export type ProductUpsertInput = {
  supplierSkuId: string
  planCode?: string | null
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag?: string | null
  displayDays: number
  dataCapacity?: string | null
  description?: string | null
  networkType?: string | null
  isNativeSim?: boolean
  sellPrice: number
  costPrice: number
  benefitPrice?: number   // 未提供則以 costPrice × 倍率自動計算
  sortOrder?: number
}

export async function upsertProduct(id: string | undefined, input: ProductUpsertInput) {
  // 福利價：後台未明確給值時，以成本 × 後台設定倍率自動帶出（單一來源 benefitPriceFromCost）
  const benefitPrice = input.benefitPrice ?? benefitPriceFromCost(input.costPrice, await getBenefitMarkup())
  const data = { ...input, benefitPrice }
  if (id) {
    return prisma.product.update({ where: { id }, data })
  }
  return prisma.product.create({ data })
}

export async function setProductStatus(id: string, status: ProductStatus) {
  return prisma.product.update({ where: { id }, data: { status } })
}

// ─── CSV batch import ─────────────────────────────────────────────

export type CsvProductRow = {
  supplierSkuId: string
  planCode?: string
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag?: string
  displayDays: number
  dataCapacity?: string
  coverageCountries?: string
  description?: string
  networkType?: string
  isNativeSim?: boolean
  sellPrice: number
  costPrice: number
  sortOrder?: number
}

// WM productType (0/1/2) → Prisma enum 對應
const WM_PRODUCT_TYPE_MAP: Record<number, SupplierProductType> = {
  0: SupplierProductType.ESIM,
  1: SupplierProductType.SIM,
  2: SupplierProductType.SIM_TOPUP,
}

// 批次匯入：idempotent，重新匯入同樣的 CSV 不會造成 duplicate。
//
// DATABASE_URL 走 PgBouncer connection_limit=1，loop 內每個 await 都要排隊，
// 50 列以上 transaction 必爆。改用 batch query 寫入：
//
//   1. findMany 取出 CSV 中已存在的 SupplierProduct
//   2. createMany 寫入新的 SupplierProduct（skipDuplicates 防競態）
//   3. updateMany-style 逐筆 update 既有的 SupplierProduct.product_name + costPrice
//      （PgBouncer 限制：仍是逐筆，但只對「需要 update」的列；通常很少）
//   4. 再 findMany 拿到所有 SupplierProduct.id 對照表
//   5. findMany 取出 (tenantAdminId, supplierSkuId) 已存在的 Product
//   6. 對既有 Product → update（保留 id，OrderItem.productId 仍指向同一列）
//      對新 Product   → createMany
//
// 不用 $transaction：失敗會留 orphan，但這些是合法資料、可被之後的匯入引用，
// 不傷害一致性。寧可放棄 strict atomicity 換取速度。
//
// 為什麼 update 既有 Product 而非 delete+create：OrderItem.productId 是 FK，
// 砍掉重練會破壞訂單關聯。保留 id 是唯一安全做法。
// 毛利保護設定（驗證套用 / 匯入共用）。單一品牌改造後暫以全域預設（關閉）回傳；
// 若要恢復可調整，改讀 PlatformSetting（見 ROADMAP，Phase 5 併入）。
export async function getMarginGuard(): Promise<MarginGuard> {
  return { ...DEFAULT_MARGIN_GUARD }
}

// 福利價倍率（單一來源：PlatformSetting.benefitMarkupRate，後台「福利價」分頁可調；
// 未設定或異常則回退 DEFAULT_BENEFIT_MARKUP）。匯入 / 新增 / 驗證重算共用同一來源。
export async function getBenefitMarkup(): Promise<number> {
  const s = await getPlatformSettings()
  return s.benefitMarkupRate || DEFAULT_BENEFIT_MARKUP
}

export async function batchCreateProducts(
  rows: CsvProductRow[],
  supplierMap?: SupplierProductMap,
  marginGuard: MarginGuard = DEFAULT_MARGIN_GUARD,
): Promise<{ count: number; created: number; updated: number }> {
  if (rows.length === 0) return { count: 0, created: 0, updated: 0 }

  // 唯一化 wmProductId（CSV 同 SKU 多列）
  const wmIds = Array.from(new Set(rows.map(r => r.supplierSkuId)))

  // ─── Step 1: 抓已存在的 SupplierProduct ──────────────────────────
  const existing = await prisma.supplierProduct.findMany({
    where: { wmProductId: { in: wmIds } },
    select: { id: true, wmProductId: true, productName: true, costPrice: true },
  })
  const existingByWmId = new Map(existing.map(s => [s.wmProductId, s]))

  // ─── Step 2: 寫入新的 SupplierProduct ─────────────────────────────
  const newSupplierData = wmIds
    .filter(id => !existingByWmId.has(id))
    .map(id => {
      const row = rows.find(r => r.supplierSkuId === id)!
      const wmInfo = supplierMap?.get(id)
      const productName = wmInfo?.productName ?? (row.countryNameZh || row.supplierSkuId)
      const productType = wmInfo
        ? (WM_PRODUCT_TYPE_MAP[wmInfo.productType] ?? SupplierProductType.ESIM)
        : SupplierProductType.ESIM
      const costPrice = wmInfo?.productPrice ?? row.costPrice
      return { wmProductId: id, productName, productType, costPrice }
    })
  if (newSupplierData.length > 0) {
    await prisma.supplierProduct.createMany({ data: newSupplierData, skipDuplicates: true })
  }

  // ─── Step 3: 對既有 SupplierProduct 更新 product_name + costPrice ─
  // 重新匯入時，wmInfo 提供新名稱 → 覆寫舊資料（解決「東南亞」之類錯誤）。
  //
  // 規模背景：商品可能逾 10k 筆，逐筆 prisma.update 在 PgBouncer 序列化下會跑
  // 數十分鐘且每個 transaction 5s 就 expire。改用 `UPDATE FROM VALUES` 一次 SQL
  // 處理整批，1000 列為一批避免 SQL 過長。
  type SupplierUpdate = { id: string; productName: string; costPrice: number }
  const supplierUpdates: SupplierUpdate[] = []
  for (const wmId of wmIds) {
    const existingRow = existingByWmId.get(wmId)
    if (!existingRow) continue
    const row = rows.find(r => r.supplierSkuId === wmId)!
    const wmInfo = supplierMap?.get(wmId)
    const desiredName = wmInfo?.productName ?? (row.countryNameZh || row.supplierSkuId)
    const desiredCost = wmInfo?.productPrice ?? row.costPrice
    if (existingRow.productName === desiredName && existingRow.costPrice === desiredCost) continue
    supplierUpdates.push({ id: existingRow.id, productName: desiredName, costPrice: desiredCost })
  }
  await bulkUpdateSupplierProducts(supplierUpdates)

  // ─── Step 4: 拿到全部 SupplierProduct.id 對照表 ──────────────────
  const allSuppliers = await prisma.supplierProduct.findMany({
    where: { wmProductId: { in: wmIds } },
    select: { id: true, wmProductId: true },
  })
  const supplierIdMap = new Map(allSuppliers.map(s => [s.wmProductId, s.id]))

  // ─── Step 5: 抓既有 Product 以便「更新而非新建」───────────────────
  // 商品的真正身分是 **plan_code（B 欄）**，每個上架方案唯一。
  // ⚠ A 欄供應商 WM SKU 會「重複」：同一個 WM 批發方案常被拆成多個國家上架
  //   （中港澳／中國／香港／澳門；南美整區 → 阿根廷／巴西／南美A），它們共用同一個
  //   SupplierProduct，只有 plan_code 不同。故比對既有商品一律以 plan_code 為鍵；
  //   沒填 plan_code 的舊資料才退回用 supplier SKU。
  // （早期用 SKU 當鍵 → 重匯時多國上架只更新得到一筆、其餘變孤兒不再被維護，已修。）
  const supplierIdsForRows = Array.from(new Set(rows.map(r => supplierIdMap.get(r.supplierSkuId)!).filter(Boolean)))
  const planCodesForRows = Array.from(new Set(
    rows.map(r => r.planCode).filter((c): c is string => !!c)
  ))
  const existingProducts = await prisma.product.findMany({
    where: {
      OR: [
        { planCode: { in: planCodesForRows } },
        { supplierSkuId: { in: supplierIdsForRows } },
      ],
    },
    select: { id: true, planCode: true, supplierSkuId: true },
  })
  const existingByPlan = new Map<string, string>()        // plan_code → productId（主鍵）
  const existingBySkuNoPlan = new Map<string, string>()   // supplierSkuId → productId（僅無 plan_code 的舊資料 fallback）
  for (const ep of existingProducts) {
    if (ep.planCode) existingByPlan.set(ep.planCode, ep.id)
    else             existingBySkuNoPlan.set(ep.supplierSkuId, ep.id)
  }

  // ─── Step 6: 分流：既有 → bulk SQL update；新的 → createMany ─────
  type ProductUpdate = { id: string; data: ReturnType<typeof buildProductData> }
  const productUpdates: ProductUpdate[] = []
  const newProductData: ReturnType<typeof buildProductData>[] = []
  const markup = await getBenefitMarkup()   // 全批共用同一倍率（後台設定）
  for (const row of rows) {
    const supplierId = supplierIdMap.get(row.supplierSkuId)
    if (!supplierId) throw new Error(`找不到 SupplierProduct.id for wmProductId=${row.supplierSkuId}`)
    // 成本/售價比照「驗證套用」：成本以 WM 即時價為準（與 SupplierProduct 一致）、
    // 成本上升時售價維持固定利潤跟漲、毛利保護開啟則補到門檻。WM 無此方案 → 沿用 Excel 值。
    const wmCost = supplierMap?.get(row.supplierSkuId)?.productPrice ?? row.costPrice
    const sell = sellPriceForCostChange({
      oldCost: row.costPrice, oldSell: row.sellPrice, newCost: wmCost,
      guardEnabled: marginGuard.enabled, minMarginRate: marginGuard.rate,
    })
    const data = buildProductData(row, supplierId, { costPrice: wmCost, sellPrice: sell }, markup)
    const existingId = row.planCode
      ? existingByPlan.get(row.planCode)
      : existingBySkuNoPlan.get(supplierId)
    if (existingId) productUpdates.push({ id: existingId, data })
    else            newProductData.push(data)
  }
  const updated = productUpdates.length
  await bulkUpdateProducts(productUpdates)

  let created = 0
  if (newProductData.length > 0) {
    // createMany 也分批：單筆 SQL 太長會碰到 PostgreSQL 64K parameter 上限
    const CREATE_BATCH = 500
    for (let i = 0; i < newProductData.length; i += CREATE_BATCH) {
      const chunk = newProductData.slice(i, i + CREATE_BATCH)
      const result = await prisma.product.createMany({ data: chunk })
      created += result.count
    }
  }

  return { count: created + updated, created, updated }
}

// SQL bulk update — 把 N 個 update 壓成一個 `UPDATE ... FROM (VALUES ...)`。
// PgBouncer connection_limit=1 + 11000+ 列規模下，逐筆 prisma.update 會跑數十
// 分鐘且每個 $transaction 5s 就 expire。raw SQL 1000 列只要 1~2 秒。
const BULK_CHUNK = 1000

async function bulkUpdateSupplierProducts(
  updates: { id: string; productName: string; costPrice: number }[],
): Promise<void> {
  if (updates.length === 0) return
  for (let i = 0; i < updates.length; i += BULK_CHUNK) {
    const chunk = updates.slice(i, i + BULK_CHUNK)
    const values = chunk.map(u => Prisma.sql`(${u.id}::text, ${u.productName}::text, ${u.costPrice}::int)`)
    await prisma.$executeRaw`
      UPDATE supplier_products AS s SET
        product_name = v.product_name,
        cost_price   = v.cost_price,
        updated_at   = NOW()
      FROM (VALUES ${Prisma.join(values)}) AS v(id, product_name, cost_price)
      WHERE s.id = v.id
    `
  }
}

async function bulkUpdateProducts(
  updates: { id: string; data: ReturnType<typeof buildProductData> }[],
): Promise<void> {
  if (updates.length === 0) return
  for (let i = 0; i < updates.length; i += BULK_CHUNK) {
    const chunk = updates.slice(i, i + BULK_CHUNK)
    const values = chunk.map(({ id, data: d }) => Prisma.sql`(
      ${id}::text,
      ${d.supplierSkuId}::text,
      ${d.countryCode}::text,
      ${d.countryNameZh}::text,
      ${d.countryNameEn}::text,
      ${d.countryFlag ?? null}::text,
      ${d.displayDays}::int,
      ${d.dataCapacity ?? null}::text,
      ${d.coverageCountries ?? null}::text,
      ${d.planCode ?? null}::text,
      ${d.networkType ?? null}::text,
      ${d.isNativeSim ?? false}::boolean,
      ${d.description ?? null}::text,
      ${d.sellPrice}::int,
      ${d.costPrice}::int,
      ${d.sortOrder ?? 0}::int
    )`)
    await prisma.$executeRaw`
      UPDATE products AS p SET
        supplier_sku_id  = v.supplier_sku_id,
        country_code     = v.country_code,
        country_name_zh  = v.country_name_zh,
        country_name_en  = v.country_name_en,
        country_flag     = v.country_flag,
        display_days     = v.display_days,
        data_capacity    = v.data_capacity,
        coverage_countries = v.coverage_countries,
        plan_code        = v.plan_code,
        network_type     = v.network_type,
        is_native_sim    = v.is_native_sim,
        description      = v.description,
        sell_price       = v.sell_price,
        cost_price       = v.cost_price,
        sort_order       = v.sort_order,
        updated_at       = NOW()
      FROM (VALUES ${Prisma.join(values)}) AS v(
        id, supplier_sku_id, country_code, country_name_zh, country_name_en, country_flag,
        display_days, data_capacity, coverage_countries, plan_code, network_type, is_native_sim, description,
        sell_price, cost_price, sort_order
      )
      WHERE p.id = v.id
    `
  }
}

function buildProductData(
  row: CsvProductRow,
  supplierId: string,
  priceOverride?: { costPrice: number; sellPrice: number },
  markup: number = DEFAULT_BENEFIT_MARKUP,
) {
  const costPrice = priceOverride?.costPrice ?? row.costPrice
  // 只挑 Product 真實欄位；**不可**用 `...row`：匯入端會在 row 上臨時掛
  // _rawProductName / _matchedByName（國家補強用），一旦被 spread 進
  // prisma.product.createMany() 就會被當成未知參數，整批匯入失敗。
  // （清空後全新匯入時 100% 走 create 路徑，此 bug 必現；update 路徑因為是逐欄
  //   列出 VALUES 反而不受影響，所以平常沒被發現。）
  return {
    supplierSkuId: supplierId,
    planCode:      row.planCode ?? null,
    countryCode:   row.countryCode,
    countryNameZh: row.countryNameZh,
    countryNameEn: row.countryNameEn,
    countryFlag:   row.countryFlag ?? null,
    displayDays:   row.displayDays,
    dataCapacity:  row.dataCapacity ?? null,
    coverageCountries: row.coverageCountries ?? null,
    description:   row.description ?? null,
    networkType:   row.networkType ?? null,
    isNativeSim:   row.isNativeSim ?? false,
    sellPrice:     priceOverride?.sellPrice ?? row.sellPrice,
    costPrice,
    benefitPrice:  benefitPriceFromCost(costPrice, markup),
    sortOrder:     row.sortOrder ?? 0,
  }
}

