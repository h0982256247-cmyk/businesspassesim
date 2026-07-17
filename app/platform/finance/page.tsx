'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type MarginFields = { cost:number; grossProfit:number; marginRate:number; eligibleRevenue:number; ordersIncluded:number; ordersExcluded:number }
type TenantStat   = { id:string;name:string;brandName:string|null;revenue:number;orders:number;groups:number;users:number;pendingCommissions:number } & MarginFields
type FinanceData  = { month:string|null;global:{revenue:number;orders:number} & MarginFields;tenants:TenantStat[] }

export default function FinancePage() {
  const router = useRouter()
  const [data, setData] = useState<FinanceData|null>(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/platform/finance${month?`?month=${month}`:''}`)
      .then(r=>r.status===401?(router.replace('/platform/login'),null):r.status===403?(router.replace('/platform'),null):r.json())
      .then(d=>{if(d)setData(d)}).finally(()=>setLoading(false))
  }, [month,router])

  const sorted = data?.tenants.slice().sort((a,b)=>b.revenue-a.revenue)??[]
  const totalTenantRevenue = sorted.reduce((s,t)=>s+Number(t.revenue),0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">財務總覽</h1>
          <p className="text-sm text-gray-400 mt-0.5">Super Admin 全平台財務報表</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
              className="text-sm border-none outline-none bg-transparent text-gray-600" />
          </div>
          {month&&<button onClick={()=>setMonth('')} className="text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2">清除</button>}
        </div>
      </div>

      {/* Super Admin scope indicator */}
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3 border bg-purple-50 border-purple-200">
        <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/></svg>
        </div>
        <div>
          <p className="text-xs font-semibold text-purple-700">Super Admin 全平台模式</p>
          <p className="text-xs text-purple-500">{month?`顯示 ${month} 的跨平台財務數據`:'顯示累計全平台財務數據'}</p>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : !data ? null : (
        <>
          {/* Global summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"/></svg>, label: month?`${month} 總營收`:'累計總營收', value: `NT$ ${Number(data.global.revenue).toLocaleString()}`, cls:'bg-blue-50 text-blue-600', bold:'text-blue-600' },
              { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>, label: month?`${month} 訂單數`:'累計訂單數', value: data.global.orders.toLocaleString(), cls:'bg-emerald-50 text-emerald-600', bold:'text-gray-800' },
              { icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5"/><circle cx="12" cy="8" r="4"/></svg>, label: 'Platform Admin 數', value: data.tenants.length.toString(), cls:'bg-purple-50 text-purple-600', bold:'text-gray-800' },
            ].map(card=>(
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl ${card.cls} flex items-center justify-center flex-shrink-0`}>{card.icon}</div>
                <div><p className="text-xs text-gray-400">{card.label}</p><p className={`text-2xl font-bold ${card.bold}`}>{card.value}</p></div>
              </div>
            ))}
          </div>

          {/* Margin summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800 text-sm">毛利分析</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  納入毛利之營收 NT$ {Number(data.global.eligibleRevenue).toLocaleString()}
                  （{data.global.ordersIncluded.toLocaleString()} 筆訂單）
                </p>
              </div>
              {data.global.ordersExcluded > 0 && (
                <span className="text-xs text-amber-600"
                  title="這些訂單建立於 unitCost 欄位上線之前，缺乏成本快照，因此不計入毛利計算。">
                  ⚠ 不含 {data.global.ordersExcluded.toLocaleString()} 筆無成本資料
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-400">成本</p>
                <p className="text-xl font-bold text-gray-700 mt-1">NT$ {Number(data.global.cost).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">分潤支出（PEND+SETTLED）</p>
                <p className="text-xl font-bold text-orange-600 mt-1">
                  NT$ {Number(data.global.eligibleRevenue - data.global.cost - data.global.grossProfit).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">毛利</p>
                <p className={`text-xl font-bold mt-1 ${data.global.grossProfit < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  NT$ {Number(data.global.grossProfit).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">毛利率</p>
                <p className={`text-xl font-bold mt-1 ${data.global.marginRate < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {(data.global.marginRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Per-tenant table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">各平台明細</h2>
              <span className="text-xs text-gray-400">{sorted.length} 個平台</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['平台名稱','訂單數','營收','成本','毛利','毛利率','待結算分潤','社群','會員','操作'].map(h=>(
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map(t=>{
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800">{t.brandName??t.name}</p>
                        {t.brandName&&<p className="text-xs text-gray-400">{t.name}</p>}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-gray-700">
                        {t.orders.toLocaleString()}
                        {t.ordersExcluded>0&&(
                          <span className="ml-1 text-[10px] text-amber-600" title={`其中 ${t.ordersExcluded} 筆未含成本快照，不計入毛利`}>⚠</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-blue-600">NT$ {Number(t.revenue).toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">NT$ {Number(t.cost).toLocaleString()}</td>
                      <td className={`px-5 py-3.5 text-sm font-semibold ${t.grossProfit<0?'text-red-600':'text-emerald-600'}`}>
                        NT$ {Number(t.grossProfit).toLocaleString()}
                      </td>
                      <td className={`px-5 py-3.5 text-sm font-medium ${t.marginRate<0?'text-red-600':'text-emerald-600'}`}>
                        {(t.marginRate*100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3.5 text-sm text-orange-600 font-medium">NT$ {Number(t.pendingCommissions).toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{t.groups}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{t.users}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/platform/admins/${t.id}`} className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 transition">設定</Link>
                      </td>
                    </tr>
                  )
                })}
                {sorted.length===0&&<tr><td colSpan={10} className="text-center text-gray-400 py-12 text-sm">暫無資料</td></tr>}
              </tbody>
              {sorted.length>0&&(() => {
                const totCost     = sorted.reduce((s,t)=>s+t.cost,0)
                const totProfit   = sorted.reduce((s,t)=>s+t.grossProfit,0)
                const totEligible = sorted.reduce((s,t)=>s+t.eligibleRevenue,0)
                // 精確毛利率：總毛利 / 納入毛利之營收
                const totRate     = totEligible>0?(totProfit/totEligible*100):0
                return (
                <tfoot className="border-t border-gray-100 bg-gray-50">
                  <tr>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-600">合計</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">{sorted.reduce((s,t)=>s+t.orders,0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-blue-600">NT$ {totalTenantRevenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">NT$ {totCost.toLocaleString()}</td>
                    <td className={`px-5 py-3 text-xs font-semibold ${totProfit<0?'text-red-600':'text-emerald-600'}`}>NT$ {totProfit.toLocaleString()}</td>
                    <td className={`px-5 py-3 text-xs font-semibold ${totRate<0?'text-red-600':'text-emerald-600'}`}>{totRate.toFixed(1)}%</td>
                    <td className="px-5 py-3 text-xs font-semibold text-orange-600">NT$ {sorted.reduce((s,t)=>s+Number(t.pendingCommissions),0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">{sorted.reduce((s,t)=>s+t.groups,0)}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-gray-700">{sorted.reduce((s,t)=>s+t.users,0)}</td>
                    <td className="px-5 py-3"/>
                  </tr>
                </tfoot>
                )
              })()}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
