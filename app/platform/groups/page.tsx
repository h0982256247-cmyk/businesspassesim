'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/platform/Toast'
import { ErrorState } from '@/components/platform/states'

type Company = {
  id: string
  name: string
  description: string | null
  inviteCode: string
  isActive: boolean
  admins: { id: string; displayName: string }[]   // 企業管理員（可多位；列表顯示第一位）
  _count: { members: number }
}
type Member = {
  id: string
  status: string
  role: string   // 'MEMBER' | 'ADMIN'
  user: { id: string; displayName: string; avatarUrl: string | null }
}

const spinner = <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

export default function CompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [assign, setAssign] = useState<Company | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  const load = () => {
    setLoading(true); setError(null)
    fetch('/api/admin/groups')
      .then(r => (r.status === 401 ? (router.replace('/platform/login'), null) : r.json()))
      .then(d => { if (d) setCompanies(d.companies) })
      .catch(() => setError('企業載入失敗，請稍後再試'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [router])

  const create = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const r = await fetch('/api/admin/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
    })
    setCreating(false)
    if (r.ok) { setNewName(''); setNewDesc(''); setShowCreate(false); load() }
    else { const d = await r.json().catch(() => ({})); toast.error(d.error ?? '建立失敗') }
  }

  const openAssign = async (c: Company) => {
    setAssign(c); setMembers([]); setMembersLoading(true)
    const d = await fetch(`/api/admin/groups/${c.id}`).then(r => r.json()).catch(() => null)
    setMembers(d?.members ?? []); setMembersLoading(false)
  }

  const toggleAdmin = async (userId: string, makeAdmin: boolean) => {
    if (!assign) return
    setBusy(true)
    const r = await fetch(`/api/admin/groups/${assign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, makeAdmin }),
    }).catch(() => null)
    setBusy(false)
    if (!r || !r.ok) { const d = r ? await r.json().catch(() => ({})) : {}; toast.error(d.error ?? '操作失敗'); return }
    // 重新載入該企業成員（反映角色）＋ 企業列表（更新管理員欄）
    const d = await fetch(`/api/admin/groups/${assign.id}`).then(x => x.json()).catch(() => null)
    setMembers(d?.members ?? [])
    load()
  }

  const toggleActive = async (c: Company) => {
    await fetch(`/api/admin/groups/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    }).catch(() => {})
    load()
  }

  const doDelete = async () => {
    if (!del) return
    setDeleting(true); setDelError(null)
    const r = await fetch(`/api/admin/groups/${del.id}`, { method: 'DELETE' }).catch(() => null)
    setDeleting(false)
    if (r && r.ok) { setDel(null); load() }
    else { const d = r ? await r.json().catch(() => ({})) : {}; setDelError(d.error ?? '刪除失敗，請稍後再試') }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">企業管理</h1>
          <p className="text-sm text-gray-400 mt-0.5">共 {companies.length} 家企業</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
          + 建立企業
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="企業名稱（必填）"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（選填）"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <div className="flex gap-2">
            <button onClick={create} disabled={creating || !newName.trim()} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white disabled:opacity-50">
              {creating ? '建立中…' : '建立（自動產生邀請碼）'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      {loading ? spinner : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['企業名稱', '邀請碼', '成員', '管理員', '狀態', '操作'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {companies.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-800">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{c.inviteCode}</span>
                  </td>
                  <td className="px-5 py-3.5"><span className="font-semibold text-gray-800">{c._count.members}</span><span className="text-xs text-gray-400"> 人</span></td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">
                    {c.admins.length > 0
                      ? <span>{c.admins[0].displayName}{c.admins.length > 1 && <span className="text-xs text-gray-400"> 等 {c.admins.length} 位</span>}</span>
                      : <span className="text-gray-300">未指派</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${c.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{c.isActive ? '啟用中' : '已停權'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      <button onClick={() => openAssign(c)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg font-medium transition">指派管理員</button>
                      <button onClick={() => toggleActive(c)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${c.isActive ? 'bg-orange-50 hover:bg-orange-100 text-orange-700' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}>
                        {c.isActive ? '停權' : '啟用'}
                      </button>
                      <button onClick={() => { setDelError(null); setDel(c) }} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-medium transition">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.length === 0 && <div className="text-center py-12"><p className="text-gray-400 text-sm">尚無企業，點右上「建立企業」新增</p></div>}
        </div>
      )}

      {/* 指派管理員 modal */}
      {assign && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAssign(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">「{assign.name}」的管理員</h2>
              <p className="text-xs text-gray-400 mt-0.5">一個企業可有多位管理員。設為管理員會自動核准為企業會員，該員即可在 LINE LIFF「管理」分頁審核／移除其他成員。</p>
            </div>
            <div className="overflow-y-auto p-3 space-y-1">
              {membersLoading ? spinner : members.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">尚無成員<br />請先把邀請碼 <span className="font-mono">{assign.inviteCode}</span> 給要當管理員的人加入</p>
              ) : members.map(m => {
                const isAdmin = m.role === 'ADMIN'
                return (
                  <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                        {m.user.displayName}
                        {isAdmin && <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">管理員</span>}
                      </p>
                      <p className="text-xs text-gray-400">{m.status === 'PENDING' ? '待審核' : m.status === 'APPROVED' ? '已核准' : '已拒絕'}</p>
                    </div>
                    {isAdmin
                      ? <button onClick={() => toggleAdmin(m.user.id, false)} disabled={busy} className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50 font-medium">移除管理員</button>
                      : <button onClick={() => toggleAdmin(m.user.id, true)} disabled={busy} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">設為管理員</button>}
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button onClick={() => setAssign(null)} className="text-sm text-gray-500 hover:text-gray-700">關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除企業 防呆確認 */}
      {del && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { if (!deleting) setDel(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">刪除企業「{del.name}」？</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-sm text-gray-600 leading-relaxed">
                此動作無法復原，將一併移除該企業的 <span className="font-semibold text-gray-800">{del._count.members}</span> 位成員（成員的 LINE 帳號本身不受影響）。
              </p>
              <p className="text-xs text-gray-400">若企業已有訂單則無法刪除，請改用「停權」。</p>
              {delError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{delError}</p>}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setDel(null)} disabled={deleting} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50">取消</button>
              <button onClick={doDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? '刪除中…' : '確定刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
