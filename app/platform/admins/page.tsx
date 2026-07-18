'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Admin = { id: string; email: string; name: string; role: string; isActive: boolean; createdAt: string }

const COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500']
const avatarCls = (n: string) => COLORS[n.charCodeAt(0) % COLORS.length]
const initials = (n: string) => n.slice(0, 2).toUpperCase()

export default function PlatformAdminsPage() {
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/platform/admins')
      .then(r => (r.status === 401 ? (router.replace('/platform/login'), null) : r.json()))
      .then(d => { if (d) setAdmins(d.admins) })
      .finally(() => setLoading(false))
  }
  useEffect(load, [router])
  useEffect(() => { fetch('/api/platform/auth/me').then(r => r.json()).then(d => { if (d.admin) setMe(d.admin.id) }) }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true); setCreateMsg(null)
    const r = await fetch('/api/platform/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(x => x.json())
    setCreating(false)
    if (r.admin) { setCreateMsg({ ok: true, text: '帳號建立成功' }); setShowForm(false); setForm({ email: '', password: '', name: '' }); load() }
    else setCreateMsg({ ok: false, text: r.error ?? '建立失敗' })
  }
  const handleToggle = async (id: string, isActive: boolean) => {
    await fetch(`/api/platform/admins/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) })
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">帳號管理</h1>
          <p className="text-sm text-gray-400 mt-0.5">商務通平台管理者 · 共 {admins.length} 個帳號</p>
        </div>
        <button onClick={() => { setShowForm(p => !p); setCreateMsg(null) }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${showForm ? 'bg-gray-100 text-gray-600' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {showForm ? '收起' : '+ 新增帳號'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">建立平台管理者帳號</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {([{ label: '姓名', key: 'name', type: 'text' }, { label: '電子郵件', key: 'email', type: 'email' }, { label: '密碼', key: 'password', type: 'password' }] as { label: string; key: string; type: string }[]).map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input type={f.type} value={form[f.key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                </div>
              ))}
            </div>
            {createMsg && <p className={`text-sm font-medium ${createMsg.ok ? 'text-green-600' : 'text-red-500'}`}>{createMsg.ok ? '✅' : '❌'} {createMsg.text}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition">{creating ? '建立中…' : '建立帳號'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-100 text-gray-600 px-5 py-2 rounded-xl text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['帳號', '狀態', '建立時間', '操作'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarCls(a.name)} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-xs font-bold">{initials(a.name)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{a.name}{a.id === me && <span className="ml-1.5 text-xs text-blue-500">（你）</span>}</p>
                        <p className="text-xs text-gray-400">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${a.isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{a.isActive ? '啟用中' : '已停用'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString('zh-TW')}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {a.id !== me && (
                      <button onClick={() => handleToggle(a.id, a.isActive)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${a.isActive ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                        {a.isActive ? '停用' : '啟用'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {admins.length === 0 && <div className="text-center py-12"><p className="text-gray-400 text-sm">目前沒有帳號資料</p></div>}
        </div>
      )}
    </div>
  )
}
