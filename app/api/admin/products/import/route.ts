import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { batchCreateProducts, type CsvProductRow } from '@/lib/services/product'
import { resolveCountry, parseProductNameSegments } from '@/lib/utils/country'
import { parseCapacityFromName, normalizeCapacity } from '@/lib/utils/capacity'

// Vercel 預設 serverless function timeout 為 10 秒，CSV 匯入需呼叫供應商 API +
// 走 PgBouncer connection_limit=1 的逐筆寫入，列數一多 10 秒不夠。拉到 60 秒
// （Hobby 上限）。
export const maxDuration = 60

// ── 欄位別名對應表（中文欄位名 → 內部英文名）──────────────────────
const HEADER_ALIAS: Record<string, string> = {
  // 中文欄位名（使用者試算表）
  '供應商方案id':   'supplierSkuId',
  '供應商方案ID':   'supplierSkuId',
  'plan_code':      'planCode',
  '商品名稱':       'productName',
  '適用地區':       'countryNameZh',
  '適用國家':       'coverageCountries',   // L 欄：前台彈窗列出的適用國家清單
  '是否為原生卡':   'isNativeSim',
  '網絡類型':       'networkType',
  '成本價nt':       'costPrice',
  '成本價(nt)':     'costPrice',
  '成本價':         'costPrice',
  '售價nt':         'sellPrice',
  '售價(nt)':       'sellPrice',
  '售價':           'sellPrice',
  '利潤':           '_skip',
  // 英文欄位名（template）
  'supplierskuid':  'supplierSkuId',
  'countrycode':    'countryCode',
  'countrynamezh':  'countryNameZh',
  'countrynateen':  'countryNameEn',
  'countryflag':    'countryFlag',
  'displaydays':    'displayDays',
  'datacapacity':   'dataCapacity',
  'description':    'description',
  'sellprice':      'sellPrice',
  'costprice':      'costPrice',
  'sortorder':      'sortOrder',
  'networktype':    'networkType',
  'isnativesim':    'isNativeSim',
  'plancode':       'planCode',
  'productname':    'productName',
}

// 必填欄位（至少要有其中一組）
const REQUIRED = ['supplierSkuId', 'sellPrice', 'costPrice']

// 從商品名稱自動解析天數，例如「日本Softbank, 3天, 1GB/天」→ 3
function parseDaysFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*天/)
  return m ? parseInt(m[1]) : null
}

// 正規化 header（去空白、小寫、去括號）
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s()（）]/g, '')
}

// 單一儲存格 → 去頭尾空白的字串。xlsx 的數值/布林儲存格在此被安全字串化，
// 整數 ID 不會被轉成科學記號（String(1234567890123) === '1234567890123'）。
function cell(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

// 直接讀「二維矩陣」而非把 Excel 轉成 CSV 文字再用逗號切——商品名稱本身常含逗號
// （例「紐澳, 10天,1GB/天」），逐字元切會錯位。矩陣由儲存格直接取值，徹底避開此問題。
function parseMatrix(matrix: unknown[][]): { rows: CsvProductRow[]; errors: string[]; notProduct?: boolean } {
  if (matrix.length < 2) return { rows: [], errors: ['檔案缺少資料列'] }

  // Parse headers with alias mapping
  const rawHeaders = (matrix[0] ?? []).map(h => cell(h).replace(/^["'﻿]+|["']+$/g, ''))
  const headers = rawHeaders.map(h => {
    const normalized = normalizeHeader(h)
    return HEADER_ALIAS[normalized] ?? HEADER_ALIAS[h] ?? normalized
  })

  // Check required fields
  const missing = REQUIRED.filter(r => !headers.includes(r))
  // 完全沒有任何必要欄位 → 此分頁不是商品資料（封面/說明頁等），回報 notProduct
  // 讓呼叫端可略過而非讓整批失敗（多分頁匯入時常見）。
  if (missing.length === REQUIRED.length) {
    return { rows: [], errors: [], notProduct: true }
  }
  // 有部分必要欄位但缺其一 → 視為商品分頁的格式錯誤，照常回報。
  if (missing.length > 0) {
    return { rows: [], errors: [`缺少必要欄位：${missing.join(', ')}（支援中文欄位名）`] }
  }

  const rows: CsvProductRow[] = []
  const errors: string[] = []

  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i] ?? []
    // 跳過全空白列（i 仍前進，故「第 N 行」與來源列號保持對齊）
    if (values.every(v => cell(v) === '')) continue

    const get = (key: string) => {
      const idx = headers.indexOf(key)
      if (idx < 0) return ''
      return cell(values[idx]).replace(/^["']+|["']+$/g, '')
    }

    const supplierSkuId = get('supplierSkuId')
    const sellPriceRaw  = get('sellPrice')
    const costPriceRaw  = get('costPrice')
    // 跳過「非商品雜訊列」：三個必要欄位（供應商方案ID、售價、成本價）全空。
    // 常見於右側說明欄文字、合併儲存格殘影、或被套用格式但無資料的列——
    // 這些列雖非「全空」（某個遠處欄位有值）卻不是商品，不應讓整批驗證失敗。
    // 有填到其中任一必要欄位才視為商品列並照常驗證/回報缺漏。
    if (!supplierSkuId && !sellPriceRaw && !costPriceRaw) continue

    const productName   = get('productName')
    const planCode      = get('planCode')
    const coverageCountries = get('coverageCountries') || undefined   // L 欄：適用國家清單原字串
    const networkType   = get('networkType') || undefined
    const isNativeRaw   = get('isNativeSim').toLowerCase()
    const isNativeSim   = isNativeRaw === '是' || isNativeRaw === 'true' || isNativeRaw === '1'

    // 商品名稱通常為「菲律賓, 1天, 2GB/天」「日本Softbank, 3天, 5GB」格式：先拆段
    const nameSegs = parseProductNameSegments(productName)

    // 用 helper 解析國家。商品名稱為空或抓不到時，POST 階段會再用供應商
    // API 提供的方案名稱補強，所以這裡先得到「以 CSV 為主」的結果即可。
    const resolved = resolveCountry(
      productName,
      get('countryCode'),
      get('countryNameZh'),
      get('countryNameEn'),
      get('countryFlag'),
    )
    const countryCode   = resolved.countryCode
    const countryNameZh = resolved.countryNameZh
    const countryNameEn = resolved.countryNameEn
    const countryFlag   = resolved.countryFlag

    // displayDays:
    //   1) CSV displayDays 欄位
    //   2) 商品名稱第 2 段（已被 parseProductNameSegments 解出）
    //   3) 整段 productName regex 抓「X天」
    const explicitDays = get('displayDays')
    let displayDays = explicitDays ? parseInt(explicitDays) : NaN
    if (isNaN(displayDays) && nameSegs.days) displayDays = nameSegs.days
    if (isNaN(displayDays) && productName) displayDays = parseDaysFromName(productName) ?? NaN

    // dataCapacity 只認：1) 明確的流量欄  2) C 欄商品名稱。
    // 「不」再從 planCode / supplierSkuId 猜 —— 吃到飽方案的供應商編號天生帶 GB 字樣
    // （例 WM-e-JP-SB-5GB-5D / JP-SB-5GB-5D 其實是「無限量吃到飽」），一旦 fallback
    // 去讀它就會把吃到飽誤判成「總量5GB」（日本吃到飽消失的真因）。寧可留空也不要猜錯。
    // 統一正規化：每日 "1GB/天"、總量 "總量1GB"、吃到飽 鈦金/無限/高速吃到飽
    const dataCapacity = normalizeCapacity(
      get('dataCapacity')
      || (productName ? parseCapacityFromName(productName) : null),
    ) ?? undefined

    const sellPrice = parseInt(sellPriceRaw)
    const costPrice = parseInt(costPriceRaw)
    const sortOrder = parseInt(get('sortOrder')) || 0
    const description = get('description') || undefined

    // Validation（以「本列」是否新增錯誤判斷，而非全域 errors.length）
    const before = errors.length
    if (!supplierSkuId) errors.push(`第 ${i + 1} 行：供應商方案ID（supplierSkuId）不可為空`)
    if (isNaN(displayDays) || displayDays <= 0) errors.push(`第 ${i + 1} 行：無法判斷天數（請填 displayDays 欄或在商品名稱中包含如「3天」）`)
    if (isNaN(sellPrice) || sellPrice <= 0) errors.push(`第 ${i + 1} 行：售價必須為正整數`)
    if (isNaN(costPrice) || costPrice <= 0) errors.push(`第 ${i + 1} 行：成本價必須為正整數`)

    if (errors.length === before) {
      rows.push({
        supplierSkuId,
        planCode: planCode || undefined,
        countryCode: countryCode || 'XX',
        countryNameZh: countryNameZh || supplierSkuId,
        countryNameEn,
        countryFlag,
        displayDays,
        dataCapacity,
        coverageCountries,
        description,
        networkType,
        isNativeSim,
        sellPrice,
        costPrice,
        sortOrder,
        _rawProductName: productName,
        _matchedByName: resolved.matchedByName,
      } as CsvProductRow & { _rawProductName: string; _matchedByName: boolean })
    }
  }

  return { rows, errors }
}

// 將 Excel 檔（xlsx/xls）的「每一張」sheet 都讀成二維矩陣（每列一個陣列），
// 回傳 [{ name, matrix }, ...]。先前只讀 SheetNames[0]，導致多分頁活頁簿僅匯入
// 第一個分頁；此處改為全部分頁都讀，由呼叫端逐一解析後合併。
// raw: true → 取儲存格原始值（數值仍是數值），避免長數字 ID 被格式化成科學記號；
// 以文字格式存的前導零（"007"）也會保留。
// （注意：若來源檔把 ID 欄存成「數值」型別，前導零在存檔當下即遺失，無法於此復原——
//  匯入端建議將 ID 欄位設為「文字」格式。）
// blankrows: true → 保留空白列，使「第 N 行」與 Excel 列號對齊。
async function xlsxToSheets(file: File): Promise<{ name: string; matrix: unknown[][] }[]> {
  const buf = await file.arrayBuffer()
  const workbook = XLSX.read(buf, { type: 'array' })
  if (workbook.SheetNames.length === 0) throw new Error('Excel 檔案沒有任何 sheet')
  return workbook.SheetNames.map(name => ({
    name,
    matrix: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1, raw: true, defval: '', blankrows: true,
    }),
  }))
}

// 解析 CSV 文字 → 二維矩陣。支援雙引號包夾欄位（內含逗號、換行）與 "" 跳脫引號。
function csvToMatrix(text: string): string[][] {
  const t = text.replace(/^﻿/, '')  // 去 BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (inQuote) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++ }  // "" → 字面引號
        else inQuote = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); field = ''; rows.push(row); row = []
    } else if (ch !== '\r') {
      field += ch
    }
  }
  // flush 最後一欄/列（無結尾換行時）
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }

  return rows
}

// POST /api/admin/products/import  (multipart/form-data, field: "file")
// 支援 CSV 與 Excel（.xlsx / .xls）。Excel 自動轉成 CSV 後走同一條解析。
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const formData = await req.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: '請上傳 CSV 或 Excel 檔案' }, { status: 400 })
  }

  const f = file as File
  const isExcel = /\.(xlsx|xls)$/i.test(f.name)

  // Excel：讀入「所有分頁」；CSV：單一分頁。每個分頁各自有表頭，獨立解析後合併。
  let sheets: { name: string; matrix: unknown[][] }[]
  try {
    sheets = isExcel
      ? await xlsxToSheets(f)
      : [{ name: '', matrix: csvToMatrix(await f.text()) }]
  } catch (err) {
    const msg = err instanceof Error ? err.message : '檔案解析失敗'
    return NextResponse.json({ error: `無法解析檔案：${msg}` }, { status: 400 })
  }

  const rows: CsvProductRow[] = []
  const errors: string[] = []
  const skippedSheets: string[] = []   // 有資料但非商品格式（封面/說明頁）
  const importedSheets: string[] = []  // 實際匯入的分頁
  const multiSheet = sheets.length > 1

  for (const { name, matrix } of sheets) {
    // 完全空白的分頁直接略過（不視為錯誤、也不列入「略過清單」）
    const hasData = matrix.slice(1).some(r => (r ?? []).some(c => cell(c) !== ''))
    if (matrix.length < 2 || !hasData) continue

    const parsed = parseMatrix(matrix)
    if (parsed.notProduct) {
      if (name) skippedSheets.push(name)
      continue
    }

    // 多分頁時，把「第 N 行」前面加上分頁名稱，方便定位是哪個分頁出錯。
    const tag = multiSheet && name ? `[${name}] ` : ''
    for (const e of parsed.errors) errors.push(tag + e)
    if (parsed.rows.length > 0) {
      rows.push(...parsed.rows)
      if (name) importedSheets.push(name)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: '驗證失敗，整批未寫入', details: errors }, { status: 422 })
  }

  if (rows.length === 0) {
    const hint = skippedSheets.length > 0 ? `（略過非商品分頁：${skippedSheets.join('、')}）` : ''
    return NextResponse.json({ error: `找不到有效商品資料列${hint}` }, { status: 400 })
  }

  // 匯入只寫入 Excel 原始資料：成本／售價一律照試算表，不在此向世界移動查價或同步，
  // 國家解析也只靠 Excel（C 欄商品名稱／國家欄）。WM 成本驗證與「成本跟隨 WM：成本↑
  // 售價跟漲、成本↓降回 WM、售價不變」一律改由後台「驗證方案」按鈕觸發（GET
  // /api/admin/products/validate 比對、POST .../apply 套用），讓匯入快速單純、
  // 不受 WM API 連線狀況影響。
  try {
    const result = await batchCreateProducts(rows, auth.tenantAdminId)

    const warns: string[] = []
    if (skippedSheets.length > 0) warns.push(`略過非商品分頁：${skippedSheets.join('、')}`)

    const parts: string[] = []
    if (result.created > 0) parts.push(`新增 ${result.created} 筆`)
    if (result.updated > 0) parts.push(`更新 ${result.updated} 筆`)
    const summary = parts.length > 0 ? parts.join('、') : `處理 ${result.count} 筆`
    // 多分頁時附上實際匯入的分頁數，讓使用者確認全部分頁都吃到。
    const sheetNote = multiSheet && importedSheets.length > 0 ? `；共 ${importedSheets.length} 個分頁` : ''

    return NextResponse.json({
      message:  `匯入完成（${summary}${sheetNote}）`,
      warnings: warns.length > 0 ? warns : undefined,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '匯入失敗'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
