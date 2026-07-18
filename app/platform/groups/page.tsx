'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Company = {
  id: string
  name: string
  description: string | null
  inviteCode: string
  isActive: boolean
  adminUser: { id: string; displayName: string } | null
  _count: { members: number }
}
type Member = {
  id: string
  status: string
  user: { id: string; displayName: string; avatarUrl: string | null }
}

const spinner = <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

export default function CompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [assign, setAssign] = useState<Company | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/groups')
      .then(r => (r.status === 401 ? (router.replace('/platform/login'), null) : r.json()))
      .then(d => { if (d) setCompanies(d.companies) })
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
    else { const d = await r.json().catch(() => ({})); window.alert(d.error ?? '建立失敗') }
  }

  const openAssign = async (c: Company) => {
    setAssign(c); setMembers([]); setMembersLoading(true)
    const d = await fetch(`/api/admin/groups/${c.id}`).then(r => r.json()).catch(() => null)
    setMembers(d?.members ?? []); setMembersLoading(false)
  }

  const doAssign = async (userId: string | null) => {
    if (!assign) return
    setBusy(true)
    await fetch(`/api/admin/groups/${assign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUserId: userId }),
    }).catch(() => {})
    setBusy(false); setAssign(null); load()
  }

  const toggleActive = async (c: Company) => {
    await fetch(`/api/admin/groups/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    }).catch(() => {})
    load()
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

      {loading ? spinner : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
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
                  <td className="px-5 py-3.5 text-sm text-gray-600">{c.adminUser?.displayName ?? <span className="text-gray-300">未指派</span>}</td>
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
              <h2 className="font-bold text-gray-800">指派「{assign.name}」的管理員</h2>
              <p className="text-xs text-gray-400 mt-0.5">從已加入的成員中選一位，管理員可在 LINE LIFF 審核/移除成員</p>
            </div>
            <div className="overflow-y-auto p-3 space-y-1">
              {membersLoading ? spinner : members.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">尚無成員可指派<br />請先把邀請碼 <span className="font-mono">{assign.inviteCode}</span> 給要當管理員的人加入</p>
              ) : members.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.user.displayName}</p>
                    <p className="text-xs text-gray-400">{m.status === 'PENDING' ? '待審核' : m.status === 'APPROVED' ? '已核准' : '已拒絕'}</p>
                  </div>
                  {assign.adminUser?.id === m.user.id
                    ? <span className="text-xs text-green-600 font-medium">目前管理員</span>
                    : <button onClick={() => doAssign(m.user.id)} disabled={busy} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">設為管理員</button>}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between">
              {assign.adminUser
                ? <button onClick={() => doAssign(null)} disabled={busy} className="text-xs text-red-500 hover:text-red-600">取消指派</button>
                : <span />}
              <button onClick={() => setAssign(null)} className="text-sm text-gray-500 hover:text-gray-700">關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
