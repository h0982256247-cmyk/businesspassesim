'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────

type AdminDetail = {
  id: string
  email: string
  name: string
  role: string
  isActive: boolean
  createdAt: string
  maxRebateRate: number
  tenantSlug: string | null
  brandName: string | null
  liffId: string | null
  logoUrl: string | null
  primaryColor: string | null
  lineAccessToken: string | null
  lineOaUrl: string | null
  _count: { ownedGroups: number }
}

type Stats = {
  totalUsers: number
  totalOrders: number
  totalRevenue: number
  pendingGroups: number
  approvedGroups: number
  pendingCommissions: number
  esimPendingOrders: number
}

type EsimConfig = {
  provider: string
  apiUrl: string
  merchantId: string
  deptId: string
  token: string
  isActive: boolean
  updatedAt: string
} | null

type PaymentConfig = {
  id: string
  gateway: string
  partnerKey: string
  merchantId: string
  appId: string
  appKey: string
  env: string
  isActive: boolean
  updatedAt: string
}

const TABS = ['概覽', 'eSIM 設定', '金流設定', '品牌設定', '網域設定'] as const
type Tab = typeof TABS[number]

const GATEWAY_LABEL: Record<string, string> = {
  tappay_credit: '信用卡 (TapPay)',
  tappay_linepay: 'LINE Pay (TapPay)',
}

// ─── Main Page ────────────────────────────────────────────────────

export default function AdminDetailPage() {
  const router = useRouter()
  const params = useParams()
  const adminId = params.id as string

  const [admin, setAdmin] = useState<AdminDetail | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [esimConfig, setEsimConfig] = useState<EsimConfig>(null)
  const [paymentConfigs, setPaymentConfigs] = useState<PaymentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('概覽')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [adminRes, statsRes, esimRes, payRes] = await Promise.all([
        fetch(`/api/platform/admins/${adminId}`),
        fetch(`/api/platform/admins/${adminId}/stats`),
        fetch(`/api/platform/admins/${adminId}/esim-config`),
        fetch(`/api/platform/admins/${adminId}/payment-config`),
      ])

      if (adminRes.status === 401) { router.replace('/platform/login'); return }
      if (adminRes.status === 403 || adminRes.status === 404) { router.replace('/platform/admins'); return }
      if (!adminRes.ok) { setLoadError(true); return }

      const [adminData, statsData, esimData, payData] = await Promise.all([
        adminRes.json(),
        statsRes.ok ? statsRes.json() : Promise.resolve(null),
        esimRes.ok ? esimRes.json() : Promise.resolve({}),
        payRes.ok ? payRes.json() : Promise.resolve({}),
      ])

      setAdmin(adminData.admin ?? null)
      if (statsData) setStats(statsData)
      setEsimConfig(esimData.config ?? null)
      setPaymentConfigs(payData.configs ?? [])
    } catch (e) {
      console.error('Admin detail load error:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [adminId, router])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-gray-400 text-sm p-8">載入中…</div>
  if (loadError) return (
    <div className="p-8 text-center space-y-3">
      <p className="text-red-500 font-medium">無法載入管理員資料</p>
      <p className="text-xs text-gray-400">伺服器發生錯誤，請確認資料庫遷移是否已執行，或聯絡技術支援。</p>
      <button onClick={load} className="text-sm text-blue-600 underline">重試</button>
    </div>
  )
  if (!admin) return null

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <button onClick={() => router.push('/platform/admins')} className="text-gray-400 hover:text-gray-600 text-sm">← 帳號管理</button>
      <div className="flex items-center gap-3 mt-2.5 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-base font-bold flex-shrink-0">
          {admin.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-800 truncate">{admin.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${admin.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
              {admin.isActive ? '啟用' : '停用'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{admin.email}{admin.tenantSlug ? ` · /liff/${admin.tenantSlug}` : ''}</p>
        </div>
      </div>

      {/* Tabs — 分段式膠囊 */}
      <div className="inline-flex gap-1 bg-gray-100 rounded-2xl p-1 mb-6 max-w-full overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition ${activeTab === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === '概覽' && <OverviewTab admin={admin} stats={stats} />}
      {activeTab === 'eSIM 設定' && <EsimConfigTab adminId={adminId} config={esimConfig} onSaved={load} />}
      {activeTab === '金流設定' && <PaymentConfigTab adminId={adminId} configs={paymentConfigs} onSaved={load} />}
      {activeTab === '品牌設定' && <BrandConfigTab admin={admin} onSaved={load} />}
      {activeTab === '網域設定' && <DomainConfigTab adminId={adminId} slug={admin.tenantSlug} />}
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────

function StatIcon({ kind }: { kind: string }) {
  const common = { className: 'w-4 h-4', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8 } as const
  switch (kind) {
    case 'money': return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 9v1m0-10c1.11 0 2.08.402 2.599 1M9.4 15c.52.6 1.49 1 2.6 1" /></svg>
    case 'order': return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    case 'check': return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'alert': return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
    default: return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5" /><circle cx="12" cy="8" r="4" /></svg>
  }
}

function OverviewTab({ admin, stats }: { admin: AdminDetail; stats: Stats | null }) {
  const money = (n: number) => `NT$ ${Number(n).toLocaleString()}`
  const cards = stats ? [
    { label: '會員數',      value: stats.totalUsers.toLocaleString(),                              tint: 'bg-blue-50 text-blue-600',     kind: 'people' },
    { label: '社群總數',    value: (stats.pendingGroups + stats.approvedGroups).toLocaleString(),  tint: 'bg-violet-50 text-violet-600', kind: 'people' },
    { label: '已核准社群',  value: stats.approvedGroups.toLocaleString(),                          tint: 'bg-emerald-50 text-emerald-600', kind: 'check' },
    { label: '訂單數',      value: stats.totalOrders.toLocaleString(),                             tint: 'bg-sky-50 text-sky-600',       kind: 'order' },
    { label: '總營收',      value: money(stats.totalRevenue),                                      tint: 'bg-blue-50 text-blue-600',     kind: 'money' },
    { label: '待結算分潤',  value: money(stats.pendingCommissions),                                tint: 'bg-amber-50 text-amber-600',   kind: 'money' },
    { label: '待審社群',    value: stats.pendingGroups.toLocaleString(),                           tint: stats.pendingGroups > 0 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-400', kind: 'alert' },
    { label: 'eSIM 補發中', value: stats.esimPendingOrders.toLocaleString(),                       tint: stats.esimPendingOrders > 0 ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-400', kind: 'alert' },
  ] : []

  return (
    <div className="space-y-5">
      {/* 基本資料 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">基本資料</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
          <Cell label="電子郵件" value={admin.email} />
          <Cell label="角色" value="Platform Admin" />
          <Cell label="讓利上限" value={`${Math.round(Number(admin.maxRebateRate) * 100)}%`} />
          <Cell label="建立時間" value={new Date(admin.createdAt).toLocaleDateString('zh-TW')} />
        </div>
      </div>

      {/* 數據統計 */}
      {stats && (
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-3">數據統計</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-all">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.tint}`}><StatIcon kind={c.kind} /></div>
                  <p className="text-xs text-gray-400">{c.label}</p>
                </div>
                <p className="text-xl font-bold text-gray-800">{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800 break-all">{value}</p>
    </div>
  )
}

// ─── eSIM Config Tab ──────────────────────────────────────────────

// 世界移動「測試 / 正式」是兩台獨立主機（各有不同 merchantId/deptId/token 與 wmproductId）。
const WM_API_HOSTS = {
  test: 'https://tfmshippingsys.fastmove.com.tw',
  prod: 'https://fmshippingsys.fastmove.com.tw',
} as const
type WmEnv = 'test' | 'prod'
function inferWmEnv(apiUrl: string): WmEnv {
  return apiUrl === WM_API_HOSTS.prod ? 'prod' : 'test'
}

function EsimConfigTab({
  adminId,
  config,
  onSaved,
}: {
  adminId: string
  config: EsimConfig
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    provider: config?.provider ?? 'worldmove',
    apiUrl: config?.apiUrl ?? WM_API_HOSTS.test,
    merchantId: config?.merchantId ?? '',
    deptId: config?.deptId ?? '',
    token: config?.token ?? '',
  })
  const [env, setEnv] = useState<WmEnv>(inferWmEnv(config?.apiUrl ?? ''))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const r = await fetch(`/api/platform/admins/${adminId}/esim-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then(x => x.json())
    setSaving(false)
    if (r.ok) {
      setMsg({ ok: true, text: '✅ 已儲存' })
      onSaved()
    } else {
      setMsg({ ok: false, text: `❌ ${r.error}` })
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">世界移動 eSIM API 設定</h2>
        <p className="text-xs text-gray-400 mb-4">此設定將覆蓋系統預設環境變數，僅適用於此 Platform Admin。</p>

        {config && (
          <p className="text-xs text-gray-400 mb-4">
            上次更新：{new Date(config.updatedAt).toLocaleString('zh-TW')}
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          {/* 環境切換：測試 / 正式（各為獨立主機與帳號） */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">環境</label>
            <select
              value={env}
              onChange={e => {
                const v = e.target.value as WmEnv
                setEnv(v)
                setForm(p => ({ ...p, apiUrl: v === 'prod' ? WM_API_HOSTS.prod : WM_API_HOSTS.test }))
              }}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            >
              <option value="test">測試（tfmshippingsys）</option>
              <option value="prod">正式（fmshippingsys）</option>
            </select>
            <p className="text-xs font-mono text-gray-500 mt-1 break-all">{form.apiUrl}</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">切換環境只會改 API 主機網址。商品（wmproductId）測試與正式共用，不需重新匯入。若兩環境的 Merchant ID / Dept ID / Token 不同，記得一併更新。</p>
          </div>
          {[
            { label: 'Merchant ID', key: 'merchantId', placeholder: '' },
            { label: 'Dept ID', key: 'deptId', placeholder: '' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
              <input
                type="text"
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                required
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Token</label>
            <input
              type="password"
              value={form.token}
              onChange={e => setForm(p => ({ ...p, token: e.target.value }))}
              placeholder={config ? '留空保留現有 Token' : '輸入 API Token'}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
            {config && (
              <p className="text-xs text-gray-400 mt-1">現有 Token：{config.token}</p>
            )}
          </div>

          {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存設定'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Payment Config Tab ───────────────────────────────────────────

function PaymentConfigTab({
  adminId,
  configs,
  onSaved,
}: {
  adminId: string
  configs: PaymentConfig[]
  onSaved: () => void
}) {
  const gateways = ['tappay_credit', 'tappay_linepay']
  // 共用設定從任一已存在的 config 讀取（兩者應相同）
  const anyConfig = configs[0] ?? null

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-xs text-gray-400">金流設定將覆蓋系統預設環境變數，僅適用於此 Platform Admin。</p>

      {/* ── 共用設定卡片 ─────────────────────────── */}
      <SharedTapPayCard
        adminId={adminId}
        anyConfig={anyConfig}
        allGateways={gateways}
        configs={configs}
        onSaved={onSaved}
      />

      {/* ── 各 Gateway 只設定 Merchant ID ──────── */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-1 space-y-1">
        <p className="text-xs text-gray-400 px-3 py-2 font-medium">各金流 Merchant ID ·「前台顯示」開關控制結帳頁是否出現此支付</p>
        {gateways.map(gw => {
          const existing = configs.find(c => c.gateway === gw) ?? null
          return (
            <MerchantIdCard
              key={gw}
              adminId={adminId}
              gateway={gw}
              existing={existing}
              anyConfig={anyConfig}
              onSaved={onSaved}
            />
          )
        })}
      </div>
    </div>
  )
}

// 共用設定（Partner Key / App ID / App Key / 環境）
function SharedTapPayCard({
  adminId,
  anyConfig,
  allGateways,
  configs,
  onSaved,
}: {
  adminId: string
  anyConfig: PaymentConfig | null
  allGateways: string[]
  configs: PaymentConfig[]
  onSaved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    partnerKey: anyConfig?.partnerKey ?? '',
    appId: anyConfig?.appId ?? '',
    appKey: anyConfig?.appKey ?? '',
    env: anyConfig?.env ?? 'sandbox',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    // 換 Partner Key（輸入了非遮罩的新值）等同換 TapPay 帳號，後端會清空此平台所有會員
    // 已綁定的信用卡 → 儲存前先確認，避免誤觸。沿用現有（遮罩 ****）或首次設定不提醒。
    if (anyConfig && form.partnerKey && !form.partnerKey.startsWith('****')) {
      const ok = window.confirm(
        '更換 Partner Key 會清空此平台所有會員已綁定的信用卡，使用者下次付款需重新綁卡。\n\n確定要更換嗎？',
      )
      if (!ok) return
    }
    setSaving(true)
    setMsg(null)
    // 同步更新所有 gateway（保留各自 merchantId）
    const results = await Promise.all(
      allGateways.map(gw => {
        const existingMerchantId = configs.find(c => c.gateway === gw)?.merchantId ?? ''
        return fetch(`/api/platform/admins/${adminId}/payment-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gateway: gw, ...form, merchantId: existingMerchantId }),
        }).then(x => x.json())
      })
    )
    setSaving(false)
    const allOk = results.every(r => r.ok)
    if (allOk) {
      setMsg({ ok: true, text: '✅ 共用設定已儲存' })
      setExpanded(false)
      onSaved()
    } else {
      setMsg({ ok: false, text: `❌ ${results.find(r => !r.ok)?.error ?? '儲存失敗'}` })
    }
  }

  const isSet = !!(anyConfig?.partnerKey || anyConfig?.appId)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            TapPay 共用設定
            <span className="text-xs font-normal text-gray-400">（套用全部金流）</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isSet
              ? `App ID：${anyConfig?.appId || '—'} · ${anyConfig?.env === 'production' ? '🟢 正式環境' : '🟡 沙箱測試'}`
              : '尚未設定（使用系統預設）'}
          </p>
        </div>
        <button onClick={() => setExpanded(p => !p)} className="text-xs text-blue-600 hover:underline">
          {expanded ? '收起' : (isSet ? '編輯' : '設定')}
        </button>
      </div>

      {expanded && (
        <form onSubmit={handleSave} className="mt-4 space-y-3 border-t pt-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Partner Key</label>
            <input
              type="password"
              value={form.partnerKey}
              onChange={e => setForm(p => ({ ...p, partnerKey: e.target.value }))}
              placeholder={anyConfig ? '留空保留現有 Key' : '輸入 Partner Key'}
              required={!anyConfig}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
            {anyConfig?.partnerKey && <p className="text-xs text-gray-400 mt-1">現有：{anyConfig.partnerKey}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">App ID（前端 SDK）</label>
              <input
                type="text"
                value={form.appId}
                onChange={e => setForm(p => ({ ...p, appId: e.target.value }))}
                placeholder="例：12345"
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">App Key（前端 SDK）</label>
              <input
                type="password"
                value={form.appKey}
                onChange={e => setForm(p => ({ ...p, appKey: e.target.value }))}
                placeholder={anyConfig?.appKey ? '留空保留現有 Key' : '輸入 App Key'}
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">環境</label>
            <select
              value={form.env}
              onChange={e => setForm(p => ({ ...p, env: e.target.value }))}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            >
              <option value="sandbox">沙箱（測試）</option>
              <option value="production">正式環境</option>
            </select>
          </div>

          {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? '儲存中…' : '儲存（套用此白牌信用卡＋LINE Pay）'}
            </button>
            <button type="button" onClick={() => setExpanded(false)} className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-sm">取消</button>
          </div>
        </form>
      )}
    </div>
  )
}

// 各 Gateway 只設定 Merchant ID
function MerchantIdCard({
  adminId,
  gateway,
  existing,
  anyConfig,
  onSaved,
}: {
  adminId: string
  gateway: string
  existing: PaymentConfig | null
  anyConfig: PaymentConfig | null
  onSaved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [merchantId, setMerchantId] = useState(existing?.merchantId ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [active, setActive] = useState(existing?.isActive ?? false)
  const [toggling, setToggling] = useState(false)

  // 前台顯示開關：關閉後 LIFF 結帳不顯示此支付方式（只動 isActive，不碰金鑰）
  const handleToggle = async () => {
    if (!existing || toggling) return
    const next = !active
    setToggling(true)
    setMsg(null)
    const r = await fetch(`/api/platform/admins/${adminId}/payment-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway, isActive: next }),
    }).then(x => x.json()).catch(() => ({ error: '連線失敗' }))
    setToggling(false)
    if (r.error) { setMsg({ ok: false, text: `❌ ${r.error}` }); return }
    setActive(next)
    onSaved()
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const r = await fetch(`/api/platform/admins/${adminId}/payment-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gateway,
        merchantId,
        // 帶入共用設定（保留現有加密值）
        partnerKey: existing?.partnerKey ?? anyConfig?.partnerKey ?? '',
        appId: existing?.appId ?? anyConfig?.appId ?? '',
        appKey: existing?.appKey ?? anyConfig?.appKey ?? '',
        env: existing?.env ?? anyConfig?.env ?? 'sandbox',
      }),
    }).then(x => x.json())
    setSaving(false)
    if (r.ok) {
      setMsg({ ok: true, text: '✅ 已儲存' })
      setExpanded(false)
      onSaved()
    } else {
      setMsg({ ok: false, text: `❌ ${r.error}` })
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-gray-800">{GATEWAY_LABEL[gateway] ?? gateway}</p>
            {existing && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {active ? '前台顯示中' : '前台已隱藏'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {existing?.merchantId ? `Merchant ID：${existing.merchantId}` : '尚未設定 Merchant ID'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {existing && (
            <button onClick={handleToggle} disabled={toggling} title="關閉後前台結帳不顯示此支付方式"
              className={`relative w-10 h-6 rounded-full transition disabled:opacity-40 ${active ? 'bg-blue-600' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-4' : ''}`} />
            </button>
          )}
          <button onClick={() => setExpanded(p => !p)} className="text-xs text-blue-600 hover:underline">
            {expanded ? '收起' : (existing?.merchantId ? '編輯' : '設定')}
          </button>
        </div>
      </div>

      {expanded && (
        <form onSubmit={handleSave} className="mt-3 space-y-2 border-t pt-3">
          {/* 若共用設定尚未儲存，禁止儲存 */}
          {!anyConfig && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ 請先儲存上方「TapPay 共用設定」，再設定 Merchant ID
            </p>
          )}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Merchant ID</label>
            <input
              type="text"
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              required
              disabled={!anyConfig}
              placeholder={`輸入 ${GATEWAY_LABEL[gateway]} 的 Merchant ID`}
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !anyConfig} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? '儲存中…' : '儲存'}
            </button>
            <button type="button" onClick={() => setExpanded(false)} className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-sm">取消</button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Brand Config Tab ─────────────────────────────────────────────

function BrandConfigTab({ admin, onSaved }: { admin: AdminDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    brandName: admin.brandName ?? '',
    tenantSlug: admin.tenantSlug ?? '',
    liffId: admin.liffId ?? '',
    logoUrl: admin.logoUrl ?? '',
    primaryColor: admin.primaryColor ?? '#FFC107',
    lineAccessToken: admin.lineAccessToken ?? '',
    lineOaUrl: admin.lineOaUrl ?? '',
  })
  // Slug 一經設定即鎖死：避免後續變更 URL 後 LINE LIFF endpoint、TapPay
  // result_url、群組分享連結、使用者書籤全部失效。後端也有同條 guard。
  const slugLocked = !!admin.tenantSlug
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const handleTestToken = async () => {
    setTesting(true)
    setTestResult(null)
    const r = await fetch(`/api/platform/admins/${admin.id}/line-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: form.lineAccessToken }),
    }).then(x => x.json()).catch(() => ({ ok: false, error: '連線失敗' }))
    setTesting(false)
    setTestResult(r.ok
      ? { ok: true, text: `✅ 已連線官方帳號：${r.displayName ?? ''}${r.basicId ? `（${r.basicId}）` : ''}` }
      : { ok: false, text: `❌ ${r.error ?? '測試失敗'}` })
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('adminId', admin.id)
    const r = await fetch('/api/platform/upload/logo', { method: 'POST', body: fd }).then(x => x.json())
    setUploading(false)
    if (r.ok) {
      setForm(p => ({ ...p, logoUrl: r.url }))
    } else {
      setUploadError(r.error ?? '上傳失敗')
    }
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const r = await fetch(`/api/platform/admins/${admin.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).then(x => x.json())
    setSaving(false)
    if (r.ok) {
      setMsg({ ok: true, text: '✅ 品牌設定已儲存' })
      onSaved()
    } else {
      setMsg({ ok: false, text: `❌ ${r.error}` })
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">白牌品牌設定</h2>
        <p className="text-xs text-gray-400 mb-4">設定此 Platform Admin 的品牌識別資訊。</p>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">品牌名稱</label>
            <input
              type="text"
              value={form.brandName}
              onChange={e => setForm(p => ({ ...p, brandName: e.target.value }))}
              placeholder="例：Bii旅"
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Slug（URL 識別碼）
              {slugLocked && (
                <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">🔒 已鎖定</span>
              )}
            </label>
            <input
              type="text"
              value={form.tenantSlug}
              disabled={slugLocked}
              onChange={e => setForm(p => ({ ...p, tenantSlug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
              placeholder="例：bii-travel"
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 ${
                slugLocked ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''
              }`}
            />
            {slugLocked ? (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Slug 一經設定即無法變更，避免破壞既有 LIFF 網址、TapPay 跳轉連結與已分享的邀請碼。如需變更請聯絡平台管理員手動處理 DB。
              </p>
            ) : (
              <p className="text-xs text-amber-600 mt-1">⚠️ 儲存後即鎖定，無法再變更，請仔細確認字串。建議全小寫 + hyphen，例如 bii-travel。</p>
            )}
            {form.tenantSlug && (
              <EndpointUrlRow slug={form.tenantSlug} label="LIFF 網址" />
            )}
          </div>

          {/* Logo 欄位：支援直接上傳或貼網址 */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Logo 圖片</label>

            {/* 上傳區 */}
            <div className="flex items-center gap-2 mb-2">
              <label className={`inline-flex items-center gap-1.5 cursor-pointer border rounded-lg px-3 py-2 text-xs font-medium transition
                ${uploading ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                {uploading ? '上傳中…' : '選擇圖片上傳'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={uploading}
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-gray-400">PNG / JPG / WebP / SVG，最大 2 MB</span>
            </div>

            {uploadError && (
              <p className="text-xs text-red-500 mb-2">{uploadError}</p>
            )}

            {/* 或直接輸入 URL */}
            <input
              type="url"
              value={form.logoUrl}
              onChange={e => setForm(p => ({ ...p, logoUrl: e.target.value }))}
              placeholder="https://... （或直接上傳）"
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />

            {/* 預覽 */}
            {form.logoUrl && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.logoUrl} alt="Logo preview" className="h-12 w-auto object-contain rounded border bg-gray-50 p-1" />
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, logoUrl: '' }))}
                  className="text-xs text-gray-400 hover:text-red-500 transition"
                >
                  移除
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">主題色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))}
                className="h-9 w-16 border rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))}
                placeholder="#3B82F6"
                className="border rounded-xl px-3.5 py-2.5 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              />
            </div>
          </div>

          {/* ── LINE 設定（分兩區：登入用 vs 推播用，兩組是不同的 LINE Channel）── */}
          <div className="border-t pt-4 mt-1">
            <p className="text-sm font-semibold text-gray-700">LINE 設定</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-3">這兩組來自不同的 LINE Channel，請勿混用。</p>

            {/* A. LINE Login / LIFF（給商城開啟與會員登入用）*/}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">A. LINE Login / LIFF<span className="font-normal text-gray-400">（商城登入用）</span></p>
              <div>
                <label className="text-xs text-gray-500 block mb-1">LIFF ID</label>
                <input
                  type="text"
                  value={form.liffId}
                  onChange={e => setForm(p => ({ ...p, liffId: e.target.value }))}
                  placeholder="例：1234567890-abcdefgh"
                  className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                />
                {form.tenantSlug ? (
                  <EndpointUrlRow slug={form.tenantSlug} />
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">至 LINE Developers Console（LINE Login channel）申請，並把上方 LIFF 網址填回 Endpoint URL。</p>
                )}
                <p className="text-xs text-gray-400 mt-1">Login Channel ID 會自動從 LIFF ID 前綴解析，不需另填；Channel Secret 也不需填（登入用 LIFF id token 驗證）。</p>
              </div>
            </div>

            {/* B. LINE 官方帳號 / Messaging API（給推播通知用）*/}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 mt-3">
              <p className="text-xs font-semibold text-gray-600">B. LINE 官方帳號 / Messaging API<span className="font-normal text-gray-400">（推播通知用）</span></p>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Channel Access Token</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={form.lineAccessToken}
                    onChange={e => { setForm(p => ({ ...p, lineAccessToken: e.target.value })); setTestResult(null) }}
                    placeholder="輸入 Messaging API Channel Access Token"
                    className="flex-1 border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                  />
                  <button
                    type="button"
                    onClick={handleTestToken}
                    disabled={testing || !form.lineAccessToken}
                    className="shrink-0 border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
                  >
                    {testing ? '測試中…' : '測試推播'}
                  </button>
                </div>
                {testResult && <p className={`text-xs mt-1 ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>{testResult.text}</p>}
                <p className="text-xs text-gray-400 mt-1">付款成功 / eSIM 就緒 / 轉贈等通知會用此 token 從你的官方帳號推播。留空則用系統預設（多白牌時請務必填）。Messaging Channel ID / Secret 目前不需填（未接收 webhook）。</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">客服連結（官方帳號）</label>
                <input
                  type="text"
                  value={form.lineOaUrl}
                  onChange={e => setForm(p => ({ ...p, lineOaUrl: e.target.value }))}
                  placeholder="例：https://lin.ee/xxxxxxx"
                  className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                />
                <p className="text-xs text-gray-400 mt-1">前台「客服中心」的 LINE 客服按鈕會導向此連結。於 LINE 官方帳號後台「加入好友／分享」取得 lin.ee 連結；留空則前台不顯示客服按鈕。</p>
              </div>
            </div>
          </div>

          {msg && <p className={`text-sm ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

          <button
            type="submit"
            disabled={saving || uploading}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存品牌設定'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Endpoint URL Row ─────────────────────────────────────────────

function EndpointUrlRow({ slug, label = 'Endpoint URL' }: { slug: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/liff/${slug}`

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mt-1.5 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-mono text-gray-800 flex-1 truncate">{url}</span>
      <button
        type="button"
        onClick={handleCopy}
        className={`shrink-0 text-xs font-medium px-2 py-1 rounded transition ${copied ? 'bg-green-100 text-green-600' : 'bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300'}`}
      >
        {copied ? '已複製 ✓' : '複製'}
      </button>
    </div>
  )
}

// ─── Domain Config Tab ────────────────────────────────────────────

type DomainRow = { id: string; domain: string; createdAt: string }

function DomainConfigTab({ adminId, slug }: { adminId: string; slug: string | null }) {
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/platform/admins/${adminId}/domains`).then(x => x.json()).catch(() => ({}))
    setDomains(r.domains ?? [])
    setLoading(false)
  }, [adminId])

  useEffect(() => { load() }, [load])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const r = await fetch(`/api/platform/admins/${adminId}/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: input }),
    }).then(x => x.json()).catch(() => ({ error: '連線失敗' }))
    setSaving(false)
    if (r.ok) { setInput(''); setMsg({ ok: true, text: '✅ 已新增，請完成下方 DNS 設定' }); load() }
    else setMsg({ ok: false, text: `❌ ${r.error ?? '新增失敗'}` })
  }

  const handleRemove = async (domain: string) => {
    await fetch(`/api/platform/admins/${adminId}/domains?domain=${encodeURIComponent(domain)}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* 預設網址（一律存在） */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">預設網址</h2>
        <p className="text-xs text-gray-400 mb-3">系統內建網址，永遠可用，不需任何設定。</p>
        {slug
          ? <EndpointUrlRow slug={slug} label="商城網址" />
          : <p className="text-xs text-amber-600">尚未設定 Slug（請先到「品牌設定」設定）。</p>}
      </div>

      {/* 自訂網域（選填） */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-1">自訂網域<span className="text-xs font-normal text-gray-400 ml-1">（選填）</span></h2>
        <p className="text-xs text-gray-400 mb-4">想用自己的網域（如 esim.yourbrand.com）開店時才需設定；設定後該網域會自動導向你的商城。</p>

        <form onSubmit={handleAdd} className="flex gap-2 mb-3">
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setMsg(null) }}
            placeholder="esim.yourbrand.com"
            className="flex-1 border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
          <button
            type="submit"
            disabled={saving || !input.trim()}
            className="shrink-0 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? '新增中…' : '新增'}
          </button>
        </form>
        {msg && <p className={`text-sm mb-3 ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

        {loading ? (
          <p className="text-xs text-gray-400">載入中…</p>
        ) : domains.length === 0 ? (
          <p className="text-xs text-gray-400">尚未綁定自訂網域。</p>
        ) : (
          <ul className="space-y-2">
            {domains.map(d => (
              <li key={d.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-sm font-mono text-gray-800 truncate">{d.domain}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(d.domain)}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition ml-2"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* DNS / Vercel 設定指引（此版本不自動掛載，需手動完成兩步） */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
          <p className="text-base font-semibold text-gray-800 mb-1">完成綁定還需兩步（一次性）：</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>在 Vercel 專案 → Settings → Domains 把此網域 <code className="bg-amber-100 px-1 rounded">Add Domain</code></li>
            <li>到你的 DNS 服務商把該網域指向 Vercel（CNAME → <code className="bg-amber-100 px-1 rounded">cname.vercel-dns.com</code>，根網域用 A → Vercel 指定 IP）</li>
          </ol>
          <p className="mt-1 text-amber-600">DNS 生效後，訪客打開此網域就會自動進入你的商城。</p>
        </div>
      </div>
    </div>
  )
}
