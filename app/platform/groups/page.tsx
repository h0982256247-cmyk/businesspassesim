'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TenantScopeBar from '@/components/platform/TenantScopeBar'

type Group = {
  id: string; name: string; status: string; rebateRate: number
  monthlyCouponQuota: number
  inviteCode: string; createdAt: string
  owner: { displayName: string; lineUid: string }
  _count: { members: number }
  tenantAdmin: { name: string; brandName: string | null } | null
}
type CurrentUser = { role: string; maxRebateRate: number }
const STATUS_OPTS = ['', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']
const STATUS: Record<string, { text: string; cls: string }> = {
  PENDING:   { text: '審核中', cls: 'bg-yellow-50 text-yellow-600' },
  APPROVED:  { text: '已核准', cls: 'bg-green-50 text-green-600' },
  REJECTED:  { text: '已拒絕', cls: 'bg-red-50 text-red-500' },
  SUSPENDED: { text: '已停權', cls: 'bg-gray-100 text-gray-400' },
}
export default function GroupsPage() {
  return <Suspense fallback={<div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}><GroupsContent /></Suspense>
}
function GroupsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [platformAdmins, setPlatformAdmins] = useState<{ id: string; name: string; brandName: string | null }[]>([])
  const [filterTenantId, setFilterTenantId] = useState<string>('')
  const [editingRebate, setEditingRebate] = useState<string | null>(null)
  const [rebateInput, setRebateInput] = useState('')
  const [savingRebate, setSavingRebate] = useState(false)
  const [rebateError, setRebateError] = useState<string | null>(null)
  const [editingQuota, setEditingQuota] = useState<string | null>(null)
  const [quotaInput, setQuotaInput] = useState('')
  const [savingQuota, setSavingQuota] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  const load = () => {
    setLoading(true)
    fetch(`/api/admin/groups${statusFilter ? `?status=${statusFilter}` : ''}${filterTenantId ? `${statusFilter ? '&' : '?'}tenantAdminId=${filterTenantId}` : ''}`)
      .then(r => r.status === 401 ? (router.replace('/platform/login'), null) : r.json())
      .then(d => { if (d) setGroups(d.groups) }).finally(() => setLoading(false))
  }
  useEffect(load, [statusFilter, filterTenantId, router])
  useEffect(() => {
    fetch('/api/platform/auth/me').then(r => r.json()).then(d => {
      if (d.admin) {
        setCurrentUser({ role: d.admin.role, maxRebateRate: d.admin.maxRebateRate != null ? Number(d.admin.maxRebateRate) : 0.30 })
        if (d.admin.role === 'SUPER_ADMIN') {
          fetch('/api/platform/admins').then(r => r.json()).then(a => {
            setPlatformAdmins((a.admins ?? []).filter((x: { role: string }) => x.role === 'PLATFORM_ADMIN'))
          })
        }
      }
    })
  }, [])
  const handleApprove = async (id: string) => { setActionLoading(id+'_approve'); await fetch(`/api/admin/groups/${id}/approve`,{method:'POST'}); setActionLoading(null); load() }
  const handleReject = async (id: string) => { setActionLoading(id+'_reject'); await fetch(`/api/admin/groups/${id}/reject`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}); setActionLoading(null); load() }
  const handleSuspend = async (id: string, name: string) => {
    const note = window.prompt(`停權「${name}」後，該社群的所有未使用優惠券將立即失效。\n停權原因（選填）：`, '')
    if (note === null) return
    setActionLoading(id+'_suspend')
    const r = await fetch(`/api/admin/groups/${id}/suspend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})}).then(x=>x.json())
    setActionLoading(null)
    if (r.error) { window.alert(`停權失敗：${r.error}`); return }
    window.alert(`已停權社群，作廢 ${r.voidedCoupons} 張優惠券`)
    load()
  }
  const handleSaveRebate = async (groupId: string) => {
    setSavingRebate(true); setRebateError(null)
    const pct = parseFloat(rebateInput); const ceiling = currentUser?.maxRebateRate ?? 0.30
    if (isNaN(pct)||pct<0||pct>ceiling*100) { setRebateError(`請輸入 0 ~ ${Math.round(ceiling*100)} 之間的數值`); setSavingRebate(false); return }
    const r = await fetch(`/api/admin/groups/${groupId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({rebateRate:pct/100})}).then(x=>x.json())
    setSavingRebate(false); if(r.ok){setEditingRebate(null);load()}else setRebateError(r.error??'設定失敗')
  }
  const handleSaveQuota = async (groupId: string) => {
    setSavingQuota(true); setQuotaError(null)
    const n = parseInt(quotaInput, 10)
    if (isNaN(n)||n<0||n>100) { setQuotaError('請輸入 0 ~ 100'); setSavingQuota(false); return }
    const r = await fetch(`/api/admin/groups/${groupId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({monthlyCouponQuota:n})}).then(x=>x.json())
    setSavingQuota(false); if(r.ok){setEditingQuota(null);load()}else setQuotaError(r.error??'設定失敗')
  }
  const canEditRebate = currentUser?.role==='SUPER_ADMIN'||currentUser?.role==='PLATFORM_ADMIN'
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-800">社群管理</h1><p className="text-sm text-gray-400 mt-0.5">共 {groups.length} 個社群</p></div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTS.map(s => (
            <button key={s} onClick={() => router.push(s ? `/platform/groups?status=${s}` : '/platform/groups')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition ${statusFilter===s?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
              {s?(STATUS[s]?.text??s):'全部'}
            </button>
          ))}
        </div>
      </div>
      {currentUser?.role==='SUPER_ADMIN'&&platformAdmins.length>0&&(
        <TenantScopeBar admins={platformAdmins} value={filterTenantId} onChange={v=>setFilterTenantId(v)} />
      )}
      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['社群名稱','社群主','成員','讓利比例','每月發券','狀態','操作',...(currentUser?.role==='SUPER_ADMIN'?['所屬平台']:[])].map(h=>(
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {groups.map(g => {
                const s=STATUS[g.status]??{text:g.status,cls:'bg-gray-100 text-gray-500'}
                const ceiling=currentUser?.maxRebateRate??0.30
                return (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800">{g.name}</p>
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{g.inviteCode}</span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{g.owner.displayName}</td>
                    <td className="px-5 py-3.5"><span className="font-semibold text-gray-800">{g._count.members}</span><span className="text-xs text-gray-400"> 人</span></td>
                    <td className="px-5 py-3.5 text-sm">
                      {editingRebate===g.id ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={Math.round(ceiling*100)} step={1} value={rebateInput} onChange={e=>setRebateInput(e.target.value)}
                              className="w-14 border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <span className="text-xs text-gray-400">%</span>
                            <button onClick={()=>handleSaveRebate(g.id)} disabled={savingRebate} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg disabled:opacity-50">{savingRebate?'…':'存'}</button>
                            <button onClick={()=>{setEditingRebate(null);setRebateError(null)}} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                          </div>
                          <p className="text-gray-400 text-xs">上限：{Math.round(ceiling*100)}%</p>
                          {rebateError&&<p className="text-red-500 text-xs">{rebateError}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">{Math.round(Number(g.rebateRate)*100)}%</span>
                          {canEditRebate&&g.status==='APPROVED'&&(
                            <button onClick={()=>{setEditingRebate(g.id);setRebateInput(String(Math.round(Number(g.rebateRate)*100)));setRebateError(null)}}
                              className="text-gray-300 hover:text-blue-500 transition" title="編輯讓利比例">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm">
                      {editingQuota===g.id ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={100} step={1} value={quotaInput} onChange={e=>setQuotaInput(e.target.value)}
                              className="w-14 border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <span className="text-xs text-gray-400">次/月</span>
                            <button onClick={()=>handleSaveQuota(g.id)} disabled={savingQuota} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg disabled:opacity-50">{savingQuota?'…':'存'}</button>
                            <button onClick={()=>{setEditingQuota(null);setQuotaError(null)}} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                          </div>
                          <p className="text-gray-400 text-xs">設定後立即生效，並每月 1 號回復</p>
                          {quotaError&&<p className="text-red-500 text-xs">{quotaError}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">{g.monthlyCouponQuota} 次/月</span>
                          {canEditRebate&&g.status==='APPROVED'&&(
                            <button onClick={()=>{setEditingQuota(g.id);setQuotaInput(String(g.monthlyCouponQuota));setQuotaError(null)}}
                              className="text-gray-300 hover:text-blue-500 transition" title="編輯每月發券上限">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{s.text}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {g.status==='PENDING'&&(
                        <div className="flex gap-1.5">
                          <button onClick={()=>handleApprove(g.id)} disabled={!!actionLoading} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 font-medium transition">{actionLoading===g.id+'_approve'?'…':'核准'}</button>
                          <button onClick={()=>handleReject(g.id)} disabled={!!actionLoading} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50 font-medium transition">{actionLoading===g.id+'_reject'?'…':'拒絕'}</button>
                        </div>
                      )}
                      {g.status==='APPROVED'&&(
                        <button onClick={()=>handleSuspend(g.id, g.name)} disabled={!!actionLoading} className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg disabled:opacity-50 font-medium transition">
                          {actionLoading===g.id+'_suspend'?'…':'停權'}
                        </button>
                      )}
                    </td>
                    {currentUser?.role==='SUPER_ADMIN'&&(
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">{g.tenantAdmin?.brandName??g.tenantAdmin?.name??'—'}</span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {groups.length===0&&<div className="text-center py-12"><p className="text-gray-400 text-sm">目前沒有符合條件的社群</p></div>}
        </div>
      )}
    </div>
  )
}
