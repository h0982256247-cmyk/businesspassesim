'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TenantScopeBar from '@/components/platform/TenantScopeBar'

type BankInfo = { bankName: string; bankAccount: string; bankBranch?: string; bankHolderName: string }
type Withdrawal = {
  id: string
  amount: number
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED'
  appliedAt: string
  processedAt: string | null
  note: string | null
  bankInfoSnapshot: BankInfo
  group: { id: string; name: string; owner: { displayName: string; lineUid: string } }
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: '審核中',      cls: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: '已核准·待撥款', cls: 'bg-blue-50  text-blue-700'  },
  PAID:     { label: '已撥款',      cls: 'bg-green-50 text-green-700' },
  REJECTED: { label: '已拒絕',      cls: 'bg-red-50   text-red-600'   },
}

export default function WithdrawalsPage() {
  const router = useRouter()
  const [list, setList] = useState<Withdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED'>('PENDING')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const [platformAdmins, setPlatformAdmins] = useState<{ id: string; name: string; brandName: string | null }[]>([])
  const [filterTenantId, setFilterTenantId] = useState('')

  useEffect(() => {
    fetch('/api/platform/auth/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.admin?.role) setCurrentRole(d.admin.role)
      if (d?.admin?.role === 'SUPER_ADMIN') {
        fetch('/api/platform/admins').then(r => r.json())
          .then(a => setPlatformAdmins((a.admins ?? []).filter((x: { role: string }) => x.role === 'PLATFORM_ADMIN')))
          .catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const load = () => {
    setLoading(true)
    fetch(`/api/admin/withdrawals${filterTenantId ? `?tenantAdminId=${filterTenantId}` : ''}`)
      .then(r => r.status === 401 ? (router.replace('/platform/login'), null) : r.json())
      .then(d => { if (d) setList(d.withdrawals ?? []) })
      .finally(() => setLoading(false))
  }
  useEffect(load, [router, filterTenantId])

  const act = async (id: string, action: 'approve' | 'reject' | 'pay') => {
    let note: string | null | undefined
    if (action === 'reject') {
      note = window.prompt('拒絕原因（會顯示給社群主）')
      if (note == null) return
    } else if (action === 'pay') {
      note = window.prompt('撥款備註（選填，例：銀行匯款 #ABC123）') ?? undefined
    }
    setBusyId(id)
    const r = await fetch(`/api/admin/withdrawals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    }).then(x => x.json())
    setBusyId(null)
    if (r.error) { window.alert(`操作失敗：${r.error}`); return }
    load()
  }

  const filtered = filter === 'ALL' ? list : list.filter(w => w.status === filter)
  const pendingCount  = list.filter(w => w.status === 'PENDING').length
  const approvedCount = list.filter(w => w.status === 'APPROVED').length
  const totalPending  = list.filter(w => w.status === 'PENDING').reduce((s, w) => s + w.amount, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">提領審核</h1>
        <p className="text-sm text-gray-400 mt-0.5">社群主分潤提領申請</p>
      </div>

      {currentRole === 'SUPER_ADMIN' && platformAdmins.length > 0 && (
        <TenantScopeBar admins={platformAdmins} value={filterTenantId} onChange={setFilterTenantId} />
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-400">待審核</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount} 筆</p>
          <p className="text-[10px] text-gray-400 mt-0.5">總額 NT${totalPending.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-400">已核准·待撥款</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{approvedCount} 筆</p>
          <p className="text-[10px] text-gray-400 mt-0.5">請完成銀行匯款後標記</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-400">總申請數</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{list.length} 筆</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'ALL'] as const).map(s => {
          const meta = s === 'ALL' ? { label: '全部', cls: 'bg-gray-100 text-gray-700' } : STATUS_META[s]
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                filter === s ? 'ring-2 ring-blue-500 ' : ''
              }${meta.cls}`}
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['社群 / 申請人', '金額', '銀行帳戶', '申請時間', '狀態', '操作'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(w => {
                const m = STATUS_META[w.status]
                const bank = w.bankInfoSnapshot
                const busy = busyId === w.id
                return (
                  <tr key={w.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-800">{w.group.name}</p>
                      <p className="text-xs text-gray-400">{w.group.owner.displayName ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800">NT${w.amount.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 leading-relaxed">
                      <p className="font-medium">{bank.bankName} {bank.bankBranch && `(${bank.bankBranch})`}</p>
                      <p className="font-mono">{bank.bankAccount}</p>
                      <p className="text-gray-400">戶名：{bank.bankHolderName}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      <p>{new Date(w.appliedAt).toLocaleString('zh-TW')}</p>
                      {w.processedAt && (
                        <p className="text-gray-400 mt-1">處理：{new Date(w.processedAt).toLocaleDateString('zh-TW')}</p>
                      )}
                      {w.note && <p className="text-gray-400 italic mt-1">{w.note}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${m.cls}`}>{m.label}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1.5">
                        {w.status === 'PENDING' && (
                          <>
                            <button disabled={busy} onClick={() => act(w.id, 'approve')}
                              className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1 rounded-lg font-medium transition disabled:opacity-50">
                              核准
                            </button>
                            <button disabled={busy} onClick={() => act(w.id, 'reject')}
                              className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1 rounded-lg font-medium transition disabled:opacity-50">
                              拒絕
                            </button>
                          </>
                        )}
                        {w.status === 'APPROVED' && (
                          <button disabled={busy} onClick={() => act(w.id, 'pay')}
                            className="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1 rounded-lg font-medium transition disabled:opacity-50">
                            標記已撥款
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-12 text-sm">沒有符合條件的提領申請</p>
          )}
        </div>
      )}
    </div>
  )
}
