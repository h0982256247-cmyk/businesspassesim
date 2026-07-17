'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CountryFlag } from '@/components/common/CountryFlag'

type Product = {
  id: string
  supplierSkuId: string
  planCode: string | null
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string | null
  displayDays: number
  dataCapacity: string | null
  description: string | null
  networkType: string | null
  isNativeSim: boolean
  sellPrice: number
  costPrice: number
  sortOrder: number
  status: string
  supplierProduct: { wmProductId: string; productName: string; status: string; lastSyncAt: string | null } | null
}

const THROTTLE_MS = 5 * 60 * 1000  // 5 分鐘內再次驗證會跳確認

type IssueBase = { id: string; skuId: string; name: string; countryCode: string; countryFlag: string }
type PriceMismatchIssue = IssueBase & { currentCost: number; supplierCost: number }
type ValidateResult = {
  total: number
  clean: number
  lastSyncAt: string | null
  issues: {
    notFound:      IssueBase[]
    inactive:      IssueBase[]
    priceMismatch: PriceMismatchIssue[]
  }
}

type ApplyResult = { disabled: number; repriced: number; priceRaised: number; syncedAt: string }
type GuardSample = { country: string; days: number; cap: string | null; sell: number; cost: number; newSell: number }
type GuardState = { enabled: boolean; rate: number; belowCount: number; samples: GuardSample[] }

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '從未同步'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return '剛剛'
  if (mins < 60)  return `${mins} 分鐘前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

type EditForm = {
  countryNameZh: string
  countryNameEn: string
  countryFlag: string
  displayDays: string
  dataCapacity: string
  networkType: string
  isNativeSim: boolean
  description: string
  sellPrice: string
  costPrice: string
  sortOrder: string
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'text-green-600 bg-green-50',
  INACTIVE: 'text-gray-500 bg-gray-100',
  AUTO_INACTIVE: 'text-red-500 bg-red-50',
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '上架中',
  INACTIVE: '已下架',
  AUTO_INACTIVE: '自動下架',
}

const PAGE_SIZE = 100

export default function PlatformProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')   // 立即回應的 input value
  const [q, setQ] = useState('')                       // 實際發送 API 的 query（debounce）
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; warn?: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 搜尋 debounce：input 改變後 300ms 才真正送 query，避免每打一個字 reload
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Validate modal state
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)

  // 驗證後標記受影響的 product id，給表格 row 顯示需處理徽章
  const [affectedIds, setAffectedIds] = useState<Map<string, 'notfound' | 'mismatch'>>(new Map())

  // 成本價異動「依價差排序 + 按 SKU 去重」：同一 WM SKU 常橫跨多國上架（中港澳／南美整區），
  // 逐列顯示會洗版（光歐洲一顆 SKU 就 100+ 列）。改成一個 SKU 一列、聚合影響列數，
  // 依 |WM−我的成本| 由大到小排序，方便先處理價差最大的。currentCost/supplierCost 在同
  // 一 SKU 內一致（匯入時整批同步同一 WM 價），取首筆即可。gap>0=我的成本低於WM（成本↑售價跟漲）、
  // gap<0=我的成本高於WM（成本↓降回 WM、售價不變）。
  const mismatchGroups = useMemo(() => {
    const list = validateResult?.issues.priceMismatch ?? []
    const m = new Map<string, { skuId: string; currentCost: number; supplierCost: number; rows: number; countries: Set<string> }>()
    for (const it of list) {
      const g = m.get(it.skuId) ?? { skuId: it.skuId, currentCost: it.currentCost, supplierCost: it.supplierCost, rows: 0, countries: new Set<string>() }
      g.rows++
      const country = it.name.replace(/\s*\d+\s*天.*$/, '').trim() || it.name
      g.countries.add(country)
      m.set(it.skuId, g)
    }
    return Array.from(m.values())
      .map(g => ({ ...g, gap: g.supplierCost - g.currentCost, countryList: Array.from(g.countries) }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  }, [validateResult])

  // 毛利保護（per-tenant）
  const [guard, setGuard] = useState<GuardState | null>(null)
  const [guardBusy, setGuardBusy] = useState(false)

  // Edit modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams({
      page:     String(page),
      pageSize: String(PAGE_SIZE),
      ...(q ? { q } : {}),
    })
    fetch(`/api/admin/products?${params.toString()}`)
      .then(r => r.status === 401 ? (router.replace('/platform/login'), null) : r.json())
      .then(d => {
        if (d) {
          setProducts(d.products ?? [])
          setTotal(d.total ?? 0)
        }
      })
      .finally(() => setLoading(false))
  }

  // page 或 q 改變時重新抓資料
  useEffect(load, [router, page, q])

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    const next = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await fetch(`/api/admin/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    load()
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/admin/products/import', { method: 'POST', body: formData })
      // 若 server timeout / 500，response body 可能不是 JSON — 用 text 後嘗試 parse
      const raw = await res.text()
      let r: { message?: string; warnings?: string[]; error?: string; details?: string[] }
      try { r = JSON.parse(raw) } catch { r = { error: raw || `HTTP ${res.status}` } }

      if (res.ok && r.message) {
        const warnText = r.warnings?.length ? `（供應商驗證提示：${r.warnings.join('、')}）` : ''
        setUploadMsg({ ok: true, warn: !!warnText, text: `${r.message}${warnText}` })
        load()
      } else {
        const detail = r.details?.join('、') ?? ''
        setUploadMsg({ ok: false, text: `${r.error ?? '匯入失敗'}${detail ? `：${detail}` : ''}` })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '網路錯誤'
      setUploadMsg({ ok: false, text: `匯入失敗：${msg}（檔案太大或處理逾時時請改用較小批次）` })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // 從目前商品列表取最近一次同步時間，決定是否需要節流提示
  const latestSyncMs = (): number | null => {
    let max: number | null = null
    for (const p of products) {
      const t = p.supplierProduct?.lastSyncAt
      if (!t) continue
      const ms = new Date(t).getTime()
      if (max == null || ms > max) max = ms
    }
    return max
  }

  const handleValidate = async () => {
    // 節流：5 分鐘內已查過就跳確認
    const lastMs = latestSyncMs()
    if (lastMs != null && Date.now() - lastMs < THROTTLE_MS) {
      const rel = formatRelativeTime(new Date(lastMs).toISOString())
      const ok = window.confirm(
        `上次同步在 ${rel}。\n世界移動建議每週查詢一次，過於頻繁可能會被鎖 IP。\n\n仍要再次驗證嗎？`,
      )
      if (!ok) return
    }

    setValidating(true)
    setValidateResult(null)
    setApplyResult(null)
    const r = await fetch('/api/admin/products/validate').then(x => x.json())
    setValidating(false)
    setValidateResult(r)

    // 紀錄受影響的 product id，給表格顯示徽章
    if (r?.issues) {
      const next = new Map<string, 'notfound' | 'mismatch'>()
      for (const it of r.issues.notFound      as IssueBase[]) next.set(it.id, 'notfound')
      for (const it of r.issues.priceMismatch as PriceMismatchIssue[]) next.set(it.id, 'mismatch')
      setAffectedIds(next)
    }
  }

  const handleApply = async () => {
    if (!validateResult) return
    const disable = validateResult.issues.notFound.length
    const reprice = validateResult.issues.priceMismatch.length
    const confirmMsg = `將執行：\n• 自動下架 ${disable} 筆查無方案\n• 更新 ${reprice} 筆成本價\n• 成本上升的方案，售價維持原利潤跟漲（毛利不足 40% 補到 40%）；成本下降不動售價\n\n確定要套用嗎？`
    if (!window.confirm(confirmMsg)) return

    setApplying(true)
    const r = await fetch('/api/admin/products/validate/apply', { method: 'POST' }).then(x => x.json())
    setApplying(false)
    if (r.error) {
      window.alert(`套用失敗：${r.error}`)
      return
    }
    setApplyResult(r)
    setValidateResult(null)
    setAffectedIds(new Map())   // 套用後清除徽章
    load()
  }

  // ── 毛利保護 ──────────────────────────────────────────────
  const loadGuard = () => {
    fetch('/api/admin/products/margin-guard')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setGuard(d) })
      .catch(() => {})
  }
  useEffect(loadGuard, [])

  const patchGuard = async (patch: { enabled?: boolean; rate?: number }) => {
    setGuardBusy(true)
    const r = await fetch('/api/admin/products/margin-guard', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).then(x => x.json()).catch(() => null)
    setGuardBusy(false)
    if (r?.error) window.alert(r.error)
    else if (r) setGuard(r)
  }

  const handleRaiseMargin = async () => {
    if (!guard || guard.belowCount === 0) return
    const preview = guard.samples.slice(0, 3)
      .map(s => `• ${s.country} ${s.days}天 ${s.cap ?? ''}：NT$${s.sell} → NT$${s.newSell}`).join('\n')
    const more = guard.belowCount > 3 ? `\n…等共 ${guard.belowCount} 筆` : ''
    if (!window.confirm(`將把毛利低於 ${guard.rate}% 的 ${guard.belowCount} 筆商品售價補到 ${guard.rate}% 毛利：\n${preview}${more}\n\n確定要套用嗎？`)) return
    setGuardBusy(true)
    const r = await fetch('/api/admin/products/margin-guard', { method: 'POST' }).then(x => x.json()).catch(() => null)
    setGuardBusy(false)
    if (r?.error) { window.alert(r.error); return }
    window.alert(`已補價 ${r.raised} 筆`)
    loadGuard(); load()
  }

  const openEdit = (p: Product) => {
    setEditingProduct(p)
    setEditForm({
      countryNameZh: p.countryNameZh,
      countryNameEn: p.countryNameEn,
      countryFlag: p.countryFlag ?? '',
      displayDays: String(p.displayDays),
      dataCapacity: p.dataCapacity ?? '',
      networkType: p.networkType ?? '',
      isNativeSim: p.isNativeSim,
      description: p.description ?? '',
      sellPrice: String(p.sellPrice),
      costPrice: String(p.costPrice),
      sortOrder: String(p.sortOrder),
    })
    setSaveMsg(null)
  }

  const closeEdit = () => {
    setEditingProduct(null)
    setEditForm(null)
    setSaveMsg(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct || !editForm) return
    setSaving(true)
    setSaveMsg(null)
    const r = await fetch(`/api/admin/products/${editingProduct.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierSkuId: editingProduct.supplierSkuId,
        planCode: editingProduct.planCode ?? undefined,
        countryCode: editingProduct.countryCode,
        countryNameZh: editForm.countryNameZh,
        countryNameEn: editForm.countryNameEn,
        countryFlag: editForm.countryFlag || null,
        displayDays: parseInt(editForm.displayDays),
        dataCapacity: editForm.dataCapacity || null,
        networkType: editForm.networkType || null,
        isNativeSim: editForm.isNativeSim,
        description: editForm.description || null,
        sellPrice: parseInt(editForm.sellPrice),
        costPrice: parseInt(editForm.costPrice),
        sortOrder: parseInt(editForm.sortOrder) || 0,
      }),
    }).then(x => x.json())
    setSaving(false)
    if (r.product) {
      setSaveMsg({ ok: true, text: '✅ 儲存成功' })
      load()
      setTimeout(closeEdit, 800)
    } else {
      setSaveMsg({ ok: false, text: `❌ ${r.error ?? '儲存失敗'}` })
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">商品管理</h1>
          {total > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              共 {total.toLocaleString()} 筆
              {q && ` · 搜尋「${q}」`}
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {uploadMsg && (
            <div className={`text-sm px-3 py-1.5 rounded-lg max-w-2xl ${
              uploadMsg.ok
                ? uploadMsg.warn
                  ? 'text-amber-700 bg-amber-50'
                  : 'text-green-600 bg-green-50'
                : 'text-red-600 bg-red-50 whitespace-pre-wrap break-words'
            }`}>
              {uploadMsg.text}
            </div>
          )}
          <button
            onClick={handleValidate}
            disabled={validating}
            className={`bg-white border px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition flex items-center gap-1.5 ${validating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span>🔍</span> {validating ? '驗證中…' : '驗證方案'}
          </button>
          <label className={`bg-white border px-4 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-50 transition flex items-center gap-1.5 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <span>📂</span>
            {uploading ? '匯入中…' : '匯入 Excel'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          <button
            onClick={async () => {
              // 動態載入 xlsx，產生 Excel 範本（與匯入解析的欄位一致）
              const XLSX = await import('xlsx')
              const rows: (string | number)[][] = [
                ['供應商方案ID', 'plan_code', '商品名稱', '適用地區', '是否為原生卡', '網絡類型', '成本價NT', '售價NT'],
                ['WM-JP-001', 'JP-SB-1GB-3D', '日本Softbank 3天 1GB/天', '日本', '否', '4G/5G', 150, 299],
              ]
              const ws = XLSX.utils.aoa_to_sheet(rows)
              ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 9 }]
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, '商品範本')
              XLSX.writeFile(wb, 'products_template.xlsx')
            }}
            className="bg-white border px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition flex items-center gap-1.5"
          >
            <span>⬇️</span> Excel 範本
          </button>
        </div>
      </div>

      {/* 毛利保護設定列 */}
      {guard && (
        <div className="mb-4 flex items-center gap-3 flex-wrap bg-white border rounded-xl px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <span>🛡️</span> 毛利保護
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={guard.enabled}
            aria-label="毛利保護開關"
            onClick={() => patchGuard({ enabled: !guard.enabled })}
            disabled={guardBusy}
            className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${guard.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${guard.enabled ? 'translate-x-4' : ''}`} />
          </button>
          {guard.enabled ? (
            <>
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                最低毛利
                <input
                  key={guard.rate}
                  type="number" min={1} max={95} defaultValue={guard.rate}
                  onBlur={e => { const v = parseInt(e.target.value); if (v && v !== guard.rate) patchGuard({ rate: v }) }}
                  className="w-14 border rounded-lg px-2 py-1 text-center text-sm"
                />
                %
              </label>
              <button
                onClick={handleRaiseMargin}
                disabled={guardBusy || guard.belowCount === 0}
                className="ml-auto bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-40 flex items-center gap-1.5"
              >
                <span>↗</span> 一鍵補到 {guard.rate}%
              </button>
              {guard.belowCount > 0 ? (
                <span className="w-full text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                  <span>⚠️</span> 目前有 {guard.belowCount} 筆商品毛利低於 {guard.rate}%，點「一鍵補到 {guard.rate}%」可一次調整售價
                </span>
              ) : (
                <span className="w-full text-xs text-green-700">✓ 目前所有上架商品毛利都達 {guard.rate}% 以上</span>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-400">關閉中 · 開啟後可設定最低毛利門檻、一鍵補價，且驗證套用／匯入也會自動把售價補到門檻</span>
          )}
        </div>
      )}

      {/* Search bar */}
      <div className="mb-4 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="搜尋國家名稱 / 代碼 / 供應商 SKU / 流量 / Plan code..."
          className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            title="清除搜尋"
          >
            ✕
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? <p className="text-gray-400 text-sm">載入中…</p> : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['國家', '天數', '流量', '售價', '成本', '毛利率', '供應商 SKU', '狀態', '操作'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map(p => {
                const flag = affectedIds.get(p.id)
                const lossy = p.sellPrice <= p.costPrice
                const marginPct = p.sellPrice > 0 ? Math.round((p.sellPrice - p.costPrice) / p.sellPrice * 100) : 0
                return (
                <tr key={p.id} className={`hover:bg-gray-50 ${flag ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {flag === 'notfound' && (
                        <span title="供應商查無此方案，建議下架" className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      )}
                      {flag === 'mismatch' && (
                        <span title="成本價與供應商不符" className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      )}
                      <CountryFlag code={p.countryCode} fallbackEmoji={p.countryFlag} size={22} />
                      <div>
                        <p className="font-medium">{p.countryNameZh}</p>
                        <p className="text-xs text-gray-400">{p.countryNameEn}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.displayDays} 天</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.dataCapacity ?? '—'}</td>
                  <td className={`px-4 py-3 font-semibold ${lossy ? 'text-red-600' : ''}`}>
                    NT${p.sellPrice}
                    {lossy && (
                      <span className="ml-1 text-xs font-normal" title="售價未高於成本，將虧損">⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">NT${p.costPrice}</td>
                  <td className="px-4 py-3">
                    <span
                      title={lossy ? '虧損（售價未高於成本）' : marginPct < (guard?.rate ?? 40) ? `低於門檻 ${guard?.rate ?? 40}%` : undefined}
                      className={`text-xs font-medium ${
                        lossy ? 'text-red-600' : marginPct < (guard?.rate ?? 40) ? 'text-amber-600' : 'text-gray-600'
                      }`}
                    >
                      {marginPct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{p.supplierProduct?.wmProductId ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[p.status] ?? ''}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleStatusToggle(p.id, p.status)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${
                          p.status === 'ACTIVE'
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {p.status === 'ACTIVE' ? '下架' : '上架'}
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {products.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">
              {q ? `找不到符合「${q}」的商品` : '尚無商品，請透過 Excel 匯入'}
            </p>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-gray-500">
            第 {((page - 1) * PAGE_SIZE + 1).toLocaleString()} – {Math.min(page * PAGE_SIZE, total).toLocaleString()} 筆
            (共 {total.toLocaleString()} 筆，第 {page}/{totalPages} 頁)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs border bg-white disabled:opacity-30 hover:bg-gray-50 transition"
            >« 第一頁</button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1.5 rounded-lg text-xs border bg-white disabled:opacity-30 hover:bg-gray-50 transition"
            >‹ 上一頁</button>

            {/* 跳頁輸入 */}
            <div className="flex items-center gap-1 mx-1">
              <input
                type="number"
                value={page}
                onChange={e => {
                  const n = parseInt(e.target.value)
                  if (!isNaN(n) && n >= 1 && n <= totalPages) setPage(n)
                }}
                min={1}
                max={totalPages}
                className="w-14 px-2 py-1 border rounded-md text-xs text-center"
              />
              <span className="text-xs text-gray-400">/ {totalPages}</span>
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs border bg-white disabled:opacity-30 hover:bg-gray-50 transition"
            >下一頁 ›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded-lg text-xs border bg-white disabled:opacity-30 hover:bg-gray-50 transition"
            >最後 »</button>
          </div>
        </div>
      )}

      {/* Validate Result Modal */}
      {validateResult && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h2 className="font-semibold text-lg">供應商方案驗證結果</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  共 {validateResult.total} 筆方案 · 正常 {validateResult.clean} 筆
                  {(validateResult.issues.notFound.length + validateResult.issues.inactive.length + validateResult.issues.priceMismatch.length) > 0 && (
                    <span className="text-amber-600 ml-1">
                      · 異常 {validateResult.issues.notFound.length + validateResult.issues.inactive.length + validateResult.issues.priceMismatch.length} 筆
                    </span>
                  )}
                  <span className="text-gray-400 ml-1">· 上次同步 {formatRelativeTime(validateResult.lastSyncAt)}</span>
                </p>
              </div>
              <button onClick={() => setValidateResult(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">
              {/* All clean */}
              {validateResult.issues.notFound.length === 0 &&
               validateResult.issues.inactive.length === 0 &&
               validateResult.issues.priceMismatch.length === 0 && (
                <div className="text-center py-8 text-green-600">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="font-medium">所有方案均正常</p>
                  <p className="text-sm text-gray-400 mt-1">全部 {validateResult.total} 筆方案皆存在且上架中，成本價無異動</p>
                </div>
              )}

              {/* Not found */}
              {validateResult.issues.notFound.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1.5">
                    <span className="bg-red-100 text-red-600 rounded-full px-2 py-0.5 text-xs">{validateResult.issues.notFound.length}</span>
                    查無方案（供應商 API 找不到此 SKU）
                  </h3>
                  <div className="space-y-1">
                    {validateResult.issues.notFound.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <CountryFlag code={item.countryCode} fallbackEmoji={item.countryFlag} size={20} />
                          <span>{item.name}</span>
                        </span>
                        <span className="font-mono text-xs text-gray-400">{item.skuId || '無 SKU'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Inactive */}
              {validateResult.issues.inactive.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                    <span className="bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-xs">{validateResult.issues.inactive.length}</span>
                    已下架（供應商已停售）
                  </h3>
                  <div className="space-y-1">
                    {validateResult.issues.inactive.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <CountryFlag code={item.countryCode} fallbackEmoji={item.countryFlag} size={20} />
                          <span>{item.name}</span>
                        </span>
                        <span className="font-mono text-xs text-gray-400">{item.skuId}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Price mismatch */}
              {mismatchGroups.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-1.5">
                    <span className="bg-amber-100 text-amber-600 rounded-full px-2 py-0.5 text-xs">{validateResult.issues.priceMismatch.length}</span>
                    成本價異動
                    <span className="text-xs font-normal text-gray-400">· {mismatchGroups.length} 個方案 · 依價差排序</span>
                  </h3>
                  <div className="space-y-1">
                    {mismatchGroups.map(g => {
                      const costUp = g.gap > 0   // 我的成本低於 WM → 成本↑ → 售價跟漲（+gap）；反之降回 WM、售價不變
                      return (
                        <div key={g.skuId} className="flex items-center justify-between gap-2 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-gray-700">
                                {g.countryList.slice(0, 3).join('、')}
                                {g.countryList.length > 3 && <span className="text-gray-400">{` +${g.countryList.length - 3}`}</span>}
                              </span>
                              {g.rows > 1 && <span className="shrink-0 text-xs text-gray-400">×{g.rows} 列</span>}
                            </div>
                            <div className="truncate font-mono text-xs text-gray-400">{g.skuId}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs">
                            <span className="text-gray-400 line-through">NT${g.currentCost}</span>
                            <span className="font-semibold text-gray-700">NT${g.supplierCost}</span>
                            <span className={`tabular-nums font-semibold ${costUp ? 'text-red-600' : 'text-green-600'}`}>
                              {costUp ? '+' : ''}{g.gap}
                            </span>
                            <span className={`rounded-full px-1.5 py-0.5 ${costUp ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                              {costUp ? `售價 +${g.gap}` : '售價不變'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </div>

            <div className="px-5 py-4 border-t shrink-0 flex gap-2">
              {(validateResult.issues.notFound.length > 0 || validateResult.issues.priceMismatch.length > 0) && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50"
                  title="自動下架查無方案、成本同步 WM：成本上升時售價跟漲（維持固定利潤）、成本下降時售價不變"
                >
                  {applying ? '套用中…' : `套用變更（${validateResult.issues.notFound.length} 下架 / ${validateResult.issues.priceMismatch.length} 改價）`}
                </button>
              )}
              <button
                onClick={() => setValidateResult(null)}
                className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-200 transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Success Toast */}
      {applyResult && (
        <div className="fixed bottom-6 right-6 bg-white border border-green-200 shadow-lg rounded-xl px-5 py-3.5 z-50 flex items-center gap-3 max-w-sm">
          <div className="text-green-600 text-xl">✅</div>
          <div className="flex-1">
            <p className="font-medium text-sm">已套用變更</p>
            <p className="text-xs text-gray-500 mt-0.5">
              自動下架 {applyResult.disabled} 筆 · 成本價更新 {applyResult.repriced} 筆 · 售價跟漲 {applyResult.priceRaised} 筆
            </p>
          </div>
          <button onClick={() => setApplyResult(null)} className="text-gray-400 hover:text-gray-600 text-lg shrink-0">✕</button>
        </div>
      )}

      {/* Edit Modal */}
      {editingProduct && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">編輯商品</h2>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">國家中文名稱</label>
                  <input
                    type="text" required
                    value={editForm.countryNameZh}
                    onChange={e => setEditForm(f => f ? { ...f, countryNameZh: e.target.value } : f)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">英文名稱</label>
                  <input
                    type="text"
                    value={editForm.countryNameEn}
                    onChange={e => setEditForm(f => f ? { ...f, countryNameEn: e.target.value } : f)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1 flex items-center gap-2">
                    <span>旗幟（自動）</span>
                    <CountryFlag code={editingProduct?.countryCode} fallbackEmoji={editForm.countryFlag} size={20} />
                  </label>
                  <input
                    type="text"
                    value={editForm.countryFlag}
                    onChange={e => setEditForm(f => f ? { ...f, countryFlag: e.target.value } : f)}
                    placeholder="留空自動依代碼產生"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">天數</label>
                  <input
                    type="number" min={1} required
                    value={editForm.displayDays}
                    onChange={e => setEditForm(f => f ? { ...f, displayDays: e.target.value } : f)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">流量</label>
                  <input
                    type="text"
                    value={editForm.dataCapacity}
                    onChange={e => setEditForm(f => f ? { ...f, dataCapacity: e.target.value } : f)}
                    placeholder="1GB"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">網絡類型</label>
                  <input
                    type="text"
                    value={editForm.networkType}
                    onChange={e => setEditForm(f => f ? { ...f, networkType: e.target.value } : f)}
                    placeholder="4G/5G"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="isNativeSim"
                    checked={editForm.isNativeSim}
                    onChange={e => setEditForm(f => f ? { ...f, isNativeSim: e.target.checked } : f)}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="isNativeSim" className="text-sm text-gray-600">原生卡 (Native SIM)</label>
                </div>
              </div>

              {(() => {
                const sellNum = parseInt(editForm.sellPrice)
                const costNum = parseInt(editForm.costPrice)
                const lossy = !isNaN(sellNum) && !isNaN(costNum) && sellNum <= costNum
                return (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">售價（NT$）</label>
                        <input
                          type="number" min={1} required
                          value={editForm.sellPrice}
                          onChange={e => setEditForm(f => f ? { ...f, sellPrice: e.target.value } : f)}
                          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${lossy ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500'}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">成本（NT$）</label>
                        <input
                          type="number" min={0} required
                          value={editForm.costPrice}
                          onChange={e => setEditForm(f => f ? { ...f, costPrice: e.target.value } : f)}
                          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${lossy ? 'border-red-300 focus:ring-red-500' : 'focus:ring-blue-500'}`}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">排序</label>
                        <input
                          type="number" min={0}
                          value={editForm.sortOrder}
                          onChange={e => setEditForm(f => f ? { ...f, sortOrder: e.target.value } : f)}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    {lossy && (
                      <p className="text-xs text-red-600 -mt-1">⚠ 售價未高於成本，這筆商品上架後每賣一筆都會虧損</p>
                    )}
                  </>
                )
              })()}

              <div>
                <label className="text-xs text-gray-500 block mb-1">商品描述</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
                  placeholder="選填"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Read-only info */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 grid grid-cols-2 gap-1">
                <span>國家代碼：<span className="font-mono font-medium text-gray-700">{editingProduct.countryCode}</span></span>
                <span>供應商 SKU：<span className="font-mono font-medium text-gray-700">{editingProduct.supplierSkuId || editingProduct.supplierProduct?.wmProductId || '—'}</span></span>
                {editingProduct.planCode && (
                  <span className="col-span-2">Plan Code：<span className="font-mono font-medium text-gray-700">{editingProduct.planCode}</span></span>
                )}
                {editingProduct.supplierProduct?.productName && (
                  <span className="col-span-2">供應商商品名稱：<span className="font-medium text-gray-700">{editingProduct.supplierProduct.productName}</span></span>
                )}
              </div>

              {saveMsg && (
                <p className={`text-sm ${saveMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{saveMsg.text}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? '儲存中…' : '儲存'}
                </button>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-sm"
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
