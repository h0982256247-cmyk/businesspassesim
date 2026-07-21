'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type User = {
  id: string; lineUid: string; displayName: string; avatarUrl: string | null
  phone: string | null; email: string | null; createdAt: string
  groupMembership: { status: string; role: string; group: { name: string } } | null
  _count: { orders: number }
}

const COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500']
const avatarCls = (n: string) => COLORS[n.charCodeAt(0) % COLORS.length]
const initials = (n: string) => n.slice(0, 2).toUpperCase()

export default function UsersPage() {
  return <Suspense fallback={<div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}><UsersContent /></Suspense>
}

function UsersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const page = parseInt(searchParams.get('page') ?? '1')
  const q = searchParams.get('q') ?? ''
  const companyId = searchParams.get('companyId') ?? ''

  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(q)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(page) })
    if (q) qs.set('q', q)
    if (companyId) qs.set('companyId', companyId)
    fetch(`/api/platform/users?${qs.toString()}`)
      .then(r => r.status === 401 ? (router.replace('/platform/login'), null) : r.json())
      .then(d => { if (d) { setUsers(d.users); setTotal(d.total) } })
      .finally(() => setLoading(false))
  }, [page, q, companyId, router])

  // 企業下拉選項（一次載入）
  useEffect(() => {
    fetch('/api/admin/groups').then(r => r.ok ? r.json() : null).then(d => { if (d?.companies) setCompanies(d.companies) }).catch(() => {})
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(`/platform/users?q=${encodeURIComponent(search)}&page=1`)
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">會員管理</h1>
          <p className="text-sm text-gray-400 mt-0.5">共 {total} 位會員</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋姓名 / LINE UID…"
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
        </div>
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition">搜尋</button>
        <select value={companyId} onChange={e=>router.push(`/platform/users?${new URLSearchParams({ ...(q?{q}:{}), ...(e.target.value?{companyId:e.target.value}:{}), page:'1' }).toString()}`)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400">
          <option value="">全部企業</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </form>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['會員', '企業歸屬', '訂單', '加入時間', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push(`/platform/users/${u.id}`)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        : <div className={`w-8 h-8 rounded-full ${avatarCls(u.displayName)} flex items-center justify-center flex-shrink-0`}><span className="text-white text-xs font-bold">{initials(u.displayName)}</span></div>
                      }
                      <div>
                        <p className="font-medium text-gray-800">{u.displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">{u.lineUid.slice(0, 14)}…</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {u.groupMembership
                      ? (() => {
                          const isAdmin = u.groupMembership.role === 'ADMIN'
                          const st = u.groupMembership.status
                          const cls = isAdmin ? 'bg-indigo-50 text-indigo-600'
                            : st === 'APPROVED' ? 'bg-green-50 text-green-600'
                            : st === 'PENDING' ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-red-50 text-red-500'
                          const label = isAdmin ? '企業管理員'
                            : st === 'APPROVED' ? '企業會員'
                            : st === 'PENDING' ? '審核中'
                            : '未通過'
                          return (
                            <div className="space-y-0.5">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{label}
                              </span>
                              <p className="text-xs text-gray-400 pl-1">{u.groupMembership.group.name}</p>
                            </div>
                          )
                        })()
                      : <span className="text-gray-300 text-xs">未加入</span>
                    }
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    <span className="font-medium text-gray-700">{u._count.orders}</span><span className="text-gray-400 text-xs"> 筆</span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString('zh-TW')}</td>
                  <td className="px-3 py-3.5 text-gray-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" /></svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div className="text-center py-12"><p className="text-gray-400 text-sm">找不到符合條件的會員</p></div>}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => router.push(`/platform/users?q=${encodeURIComponent(q)}&page=${p}`)}
              className={`w-9 h-9 rounded-xl text-sm font-medium transition ${p === page ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
