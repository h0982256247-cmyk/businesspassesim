'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TenantScopeBar from '@/components/platform/TenantScopeBar'

type MonthlyRevenue = { month: string; revenue: number; grossProfit: number }

type RecentOrder = {
  id: string
  orderNo: string
  totalPaid: number
  esimCount: number
  status: string
  createdAt: string
  userName: string
  productName: string
}

type Stats = {
  role: string
  totalUsers: number
  totalOrders: number
  totalRevenue: number
  pendingGroups: number
  totalGroupOwners: number
  totalProducts: number
  paymentConfigured: boolean
  pendingCommissions: number
  esimPendingOrders: number
  monthlyRevenue: MonthlyRevenue[]
  recentOrders: RecentOrder[]
  eligibleRevenue: number
  totalCost: number
  commissionPaid: number
  grossProfit: number
  marginRate: number
  ordersIncluded: number
  ordersExcluded: number
  riskAlerts: {
    threshold: number
    systemAlerts: { count: number; examples: { title: string; orderNo: string; at: string }[] }
    lossOrders: { count: number; examples: { id: string; orderNo: string; totalPaid: number; cost: number; loss: number }[] }
    lowMarginProducts: { count: number; examples: { id: string; name: string; sellPrice: number; costPrice: number; marginRate: number }[] }
  }
}

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PAID:          { label: '已付款',     cls: 'bg-blue-50 text-blue-600' },
  COMPLETED:     { label: '已完成發送', cls: 'bg-green-50 text-green-600' },
  PENDING:       { label: '待付款',     cls: 'bg-yellow-50 text-yellow-600' },
  PROCESSING:    { label: '待付款',     cls: 'bg-yellow-50 text-yellow-600' },
  FAILED:        { label: '付款失敗',   cls: 'bg-red-50 text-red-500' },
  ESIM_PENDING:  { label: '待發送',     cls: 'bg-orange-50 text-orange-600' },
  CANCELLED:     { label: '已取消',     cls: 'bg-gray-100 text-gray-400' },
  REFUNDED:      { label: '已退款',     cls: 'bg-red-50 text-red-500' },
}

// ── 圖表（純 SVG，無第三方套件）─────────────────────────────────────
// Catmull-Rom → 貝茲，畫出平滑曲線
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 76, h = 30
  if (values.length < 2) return <div style={{ width: w, height: h }} />
  const max = Math.max(...values), min = Math.min(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / range) * (h - 6)] as [number, number])
  return (
    <svg width={w} height={h} className="overflow-visible flex-shrink-0">
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  )
}

function TrendChart({ data }: { data: MonthlyRevenue[] }) {
  const W = 620, H = 210, padL = 46, padR = 14, padT = 16, padB = 28
  const innerW = W - padL - padR, innerH = H - padT - padB
  const max = Math.max(...data.map(d => Math.max(d.revenue, d.grossProfit)), 1)
  const x = (i: number) => padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const revPts = data.map((d, i) => [x(i), y(d.revenue)] as [number, number])
  const proPts = data.map((d, i) => [x(i), y(Math.max(d.grossProfit, 0))] as [number, number])
  const revLine = smoothPath(revPts)
  const revArea = `${revLine} L${x(data.length - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z`
  const grid = [0, 0.25, 0.5, 0.75, 1]
  const fmt = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}K` : `${Math.round(v)}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((g, i) => {
        const gy = padT + innerH - g * innerH
        return (
          <g key={i}>
            <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#eef2f7" strokeWidth="1" />
            <text x={padL - 8} y={gy + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{fmt(g * max)}</text>
          </g>
        )
      })}
      <path d={revArea} fill="url(#revFill)" />
      <path d={revLine} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={smoothPath(proPts)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {revPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke="#3b82f6" strokeWidth="2" />)}
      {data.map((d, i) => <text key={i} x={x(i)} y={H - 9} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.month}</text>)}
    </svg>
  )
}

function MetricCard({ icon, tint, label, value, change, spark, sparkColor, foot }: {
  icon: React.ReactNode; tint: string; label: string; value: string
  change?: number | null; spark?: number[] | null; sparkColor?: string; foot?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tint}`}>{icon}</div>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
      <p className="text-2xl font-extrabold text-gray-800 mt-3 leading-none">{value}</p>
      <div className="flex items-end justify-between mt-2 h-[30px]">
        {change != null ? (
          <span className={`text-xs font-medium ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            較上月 {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        ) : foot ? (
          <span className="text-xs text-gray-400">{foot}</span>
        ) : <span />}
        {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor ?? '#3b82f6'} />}
      </div>
    </div>
  )
}

export default function PlatformDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [adminName, setAdminName] = useState<string>('')
  const [platformAdmins, setPlatformAdmins] = useState<{ id: string; name: string; brandName: string | null }[]>([])
  const [filterTenantId, setFilterTenantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/platform/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.admin?.name) setAdminName(d.admin.name)
      // Super Admin 才抓白牌清單，供儀表板下鑽到單一白牌
      if (d?.admin?.role === 'SUPER_ADMIN') {
        fetch('/api/platform/admins').then(r => r.json())
          .then(a => setPlatformAdmins((a.admins ?? []).filter((x: { role: string }) => x.role === 'PLATFORM_ADMIN')))
          .catch(() => {})
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/platform/dashboard${filterTenantId ? `?tenantAdminId=${filterTenantId}` : ''}`)
      .then(async r => {
        if (r.status === 401) { router.replace('/platform/login'); return }
        if (!r.ok) {
          let msg = `伺服器回應錯誤（${r.status}）`
          try { const e = await r.json(); if (e?.error) msg = e.error } catch { /* 非 JSON 回應 */ }
          throw new Error(msg)
        }
        const d = await r.json()
        if (!cancelled) setStats(d)
      })
      .catch(e => { if (!cancelled) setError(e?.message || '儀表板載入失敗，請重新整理；若持續發生請重新登入。') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [router, filterTenantId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">載入中…</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-white border border-red-100 rounded-2xl shadow-sm p-6 max-w-sm w-full text-center">
          <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words text-left">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition">重新整理</button>
        </div>
      </div>
    )
  }
  if (!stats) return null

  const isSuper = stats.role === 'SUPER_ADMIN'
  const selectedAdmin = platformAdmins.find(a => a.id === filterTenantId)
  const scoped = isSuper && !!filterTenantId
  const scopeLabel = isSuper ? (scoped ? (selectedAdmin?.brandName ?? selectedAdmin?.name ?? '單一白牌') : '全平台合計') : '本平台'
  const mr = stats.monthlyRevenue
  const revThis = mr.at(-1)?.revenue ?? 0
  const revPrev = mr.at(-2)?.revenue ?? 0
  const proThis = mr.at(-1)?.grossProfit ?? 0
  const proPrev = mr.at(-2)?.grossProfit ?? 0
  const pct = (cur: number, prev: number) => prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100)
  const revChange = pct(revThis, revPrev)
  const proChange = pct(proThis, proPrev)

  const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const setupSteps = [
    { label: '匯入商品',       done: stats.totalProducts > 0,    href: '/platform/products', cta: '前往匯入' },
    { label: '升級社群主',     done: stats.totalGroupOwners > 0, href: '/platform/users',    cta: '前往設定' },
    { label: '設定金流 / 外觀', done: stats.paymentConfigured,    href: '/platform/liff',     cta: '前往設定' },
  ]
  const setupDone = setupSteps.filter(s => s.done).length
  const showSetup = !isSuper && setupDone < setupSteps.length

  const hasRisk = stats.riskAlerts.systemAlerts.count > 0 || stats.riskAlerts.lossOrders.count > 0 || stats.riskAlerts.lowMarginProducts.count > 0

  return (
    <div className="space-y-5">
      {/* Page header（歡迎 + 日期 + 角色範圍）*/}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-800">數據駕駛艙</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${scoped ? 'bg-blue-50 text-blue-600' : isSuper ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
              {scopeLabel}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">歡迎回來{adminName ? `，${adminName}` : ''}，今天是 {today}</p>
        </div>
        <Link href="/platform/orders" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          查看訂單
        </Link>
      </div>

      {/* Super Admin：切換白牌下鑽單一平台數據 */}
      {isSuper && platformAdmins.length > 0 && (
        <TenantScopeBar admins={platformAdmins} value={filterTenantId} onChange={setFilterTenantId} />
      )}

      {/* 開站進度（平台商專屬，做完自動隱藏）*/}
      {showSetup && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-gray-800">開站進度</p>
            <span className="text-sm font-semibold text-blue-600">{setupDone}/{setupSteps.length} 完成</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5 mb-3">完成這幾步就能正式開始營業。</p>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${(setupDone / setupSteps.length) * 100}%` }} />
          </div>
          <ul className="space-y-2.5">
            {setupSteps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${s.done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {s.done ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <span className="text-xs font-bold">{i + 1}</span>}
                </span>
                <span className={`flex-1 text-sm ${s.done ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>{s.label}</span>
                {s.done ? <span className="text-xs font-medium text-emerald-600">已完成</span> : <Link href={s.href} className="text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition">{s.cta}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard tint="bg-blue-50 text-blue-600" label="累計營收"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 9v1m0-10c1.11 0 2.08.402 2.599 1M9.4 15c.52.6 1.49 1 2.6 1" /></svg>}
          value={`NT$${stats.totalRevenue.toLocaleString()}`} change={revChange} spark={mr.map(d => d.revenue)} sparkColor="#3b82f6" />
        <MetricCard tint="bg-emerald-50 text-emerald-600" label="累計毛利"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 7h-5m5 0v5" /></svg>}
          value={`NT$${stats.grossProfit.toLocaleString()}`} change={proChange} spark={mr.map(d => Math.max(d.grossProfit, 0))} sparkColor="#10b981" />
        <MetricCard tint="bg-violet-50 text-violet-600" label="訂單總數"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          value={stats.totalOrders.toLocaleString()} foot={stats.esimPendingOrders > 0 ? `待發卡 ${stats.esimPendingOrders} 張` : '全部已處理'} />
        <MetricCard tint="bg-amber-50 text-amber-600" label="總會員數"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5" /><circle cx="12" cy="8" r="4" /></svg>}
          value={stats.totalUsers.toLocaleString()} foot={`社群主 ${stats.totalGroupOwners} 人`} />
        <MetricCard tint="bg-sky-50 text-sky-600" label="毛利率"
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19l6-12M7.5 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm9 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>}
          value={stats.ordersIncluded > 0 ? `${(stats.marginRate * 100).toFixed(1)}%` : '—'} foot={`納入 ${stats.ordersIncluded} 筆`} />
      </div>

      {/* 趨勢圖 + 右側快速統計 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">營收與毛利趨勢</h2>
              <p className="text-xs text-gray-400 mt-0.5">最近 6 個月</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />營收</span>
              <span className="flex items-center gap-1 text-gray-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />毛利</span>
            </div>
          </div>
          <TrendChart data={mr} />
        </div>

        {/* 快速統計卡 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">營運快覽</h2>
          <div className="space-y-2.5">
            <QuickStat href="/platform/commissions" label="待結算分潤" value={`NT$${stats.pendingCommissions.toLocaleString()}`} tone="text-amber-600" />
            <QuickStat href="/platform/orders?status=PAID" label="付款成功・待發卡" value={`${stats.esimPendingOrders} 張`} tone={stats.esimPendingOrders > 0 ? 'text-red-500' : 'text-gray-700'} />
            <QuickStat href="/platform/groups?status=PENDING" label="待審社群申請" value={`${stats.pendingGroups} 件`} tone={stats.pendingGroups > 0 ? 'text-amber-600' : 'text-gray-700'} />
            <QuickStat href="/platform/groups" label="社群主人數" value={`${stats.totalGroupOwners} 人`} tone="text-gray-700" />
            <QuickStat label="累計成本" value={`NT$${stats.totalCost.toLocaleString()}`} tone="text-gray-700" />
          </div>
        </div>
      </div>

      {/* 風險警示（皆 0 時不顯示）*/}
      {hasRisk && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <h2 className="text-sm font-bold text-red-700">需注意</h2>
          </div>
          {stats.riskAlerts.systemAlerts.count > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-3 mb-4">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-semibold text-red-700">系統異常（近 24 小時）</p>
                <span className="text-lg font-bold text-red-600">{stats.riskAlerts.systemAlerts.count} 筆</span>
              </div>
              <ul className="space-y-1">
                {stats.riskAlerts.systemAlerts.examples.map((a, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-600">
                    <span className="font-semibold text-red-600">{a.title}</span>
                    <span className="text-gray-400">訂單 {a.orderNo} · {new Date(a.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
                {stats.riskAlerts.systemAlerts.count > stats.riskAlerts.systemAlerts.examples.length && (
                  <li className="text-xs text-gray-400">…還有 {stats.riskAlerts.systemAlerts.count - stats.riskAlerts.systemAlerts.examples.length} 筆</li>
                )}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {stats.riskAlerts.lossOrders.count > 0 && (
              <div className="bg-white rounded-xl border border-red-100 p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">虧損訂單（實付 &lt; 成本）</p>
                  <span className="text-lg font-bold text-red-600">{stats.riskAlerts.lossOrders.count} 筆</span>
                </div>
                <ul className="space-y-1">
                  {stats.riskAlerts.lossOrders.examples.map(o => (
                    <li key={o.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span className="font-mono">{o.orderNo}</span>
                      <span>實付 NT${o.totalPaid.toLocaleString()} · 成本 NT${o.cost.toLocaleString()} · <span className="text-red-600 font-semibold">虧 NT${o.loss.toLocaleString()}</span></span>
                    </li>
                  ))}
                  {stats.riskAlerts.lossOrders.count > stats.riskAlerts.lossOrders.examples.length && (
                    <li className="text-xs text-gray-400">…還有 {stats.riskAlerts.lossOrders.count - stats.riskAlerts.lossOrders.examples.length} 筆</li>
                  )}
                </ul>
              </div>
            )}
            {stats.riskAlerts.lowMarginProducts.count > 0 && (
              <div className="bg-white rounded-xl border border-red-100 p-3">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">毛利 &lt; {(stats.riskAlerts.threshold * 100).toFixed(0)}% 商品</p>
                  <span className="text-lg font-bold text-red-600">{stats.riskAlerts.lowMarginProducts.count} 項</span>
                </div>
                <ul className="space-y-1">
                  {stats.riskAlerts.lowMarginProducts.examples.map(p => (
                    <li key={p.id} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="whitespace-nowrap">售 NT${p.sellPrice.toLocaleString()} / 成本 NT${p.costPrice.toLocaleString()} · <span className={p.marginRate < 0 ? 'text-red-600 font-semibold' : 'text-orange-600 font-semibold'}>{(p.marginRate * 100).toFixed(0)}%</span></span>
                    </li>
                  ))}
                  {stats.riskAlerts.lowMarginProducts.count > stats.riskAlerts.lowMarginProducts.examples.length && (
                    <li className="text-xs text-gray-400">…還有 {stats.riskAlerts.lowMarginProducts.count - stats.riskAlerts.lowMarginProducts.examples.length} 項，請見商品管理</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">最新訂單</h2>
          <Link href="/platform/orders" className="text-xs text-blue-600 hover:underline">查看全部</Link>
        </div>
        {stats.recentOrders.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">尚無訂單資料</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['訂單編號', '會員名稱', '產品', '金額', '狀態'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.recentOrders.map(o => {
                const s = ORDER_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-500' }
                return (
                  <tr key={o.id} onClick={() => router.push(`/platform/orders/${o.id}`)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="font-mono text-xs text-blue-600">#{o.orderNo ?? o.id.slice(-8).toUpperCase()}</span>
                      {o.esimCount > 1 && <span className="ml-2 text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">合購 {o.esimCount} 張</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">{o.userName.slice(0, 2).toUpperCase()}</div>
                        <span className="font-medium text-gray-700">{o.userName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{o.productName}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800">NT$ {o.totalPaid.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />{s.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function QuickStat({ label, value, tone, href }: { label: string; value: string; tone: string; href?: string }) {
  const inner = (
    <div className="flex items-center justify-between rounded-xl bg-gray-50/70 hover:bg-gray-100 transition px-3.5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-bold ${tone}`}>{value}</span>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
