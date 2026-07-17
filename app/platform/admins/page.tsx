'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Admin = { id:string;email:string;name:string;role:string;isActive:boolean;createdAt:string;maxRebateRate:number;parent:{name:string}|null }
const ROLE_LABEL:Record<string,string> = { SUPER_ADMIN:'Super Admin', PLATFORM_ADMIN:'Platform Admin', SUB_ADMIN:'Sub Admin' }
const ROLE_CLS:Record<string,string> = { SUPER_ADMIN:'bg-purple-50 text-purple-600', PLATFORM_ADMIN:'bg-blue-50 text-blue-600', SUB_ADMIN:'bg-gray-100 text-gray-500' }
const COLORS=['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500']
const avatarCls=(n:string)=>COLORS[n.charCodeAt(0)%COLORS.length]
const initials=(n:string)=>n.slice(0,2).toUpperCase()

export default function PlatformAdminsPage() {
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [currentRole, setCurrentRole] = useState<string|null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({email:'',password:'',name:'',role:'SUB_ADMIN',parentId:'',tenantSlug:'',brandName:'',liffId:'',primaryColor:'#FFC107'})
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<{ok:boolean;text:string}|null>(null)
  const [editingRebate, setEditingRebate] = useState<string|null>(null)
  const [rebateInput, setRebateInput] = useState('')
  const [savingRebate, setSavingRebate] = useState(false)
  const [rebateError, setRebateError] = useState<string|null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Admin|null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string|null>(null)
  const [impersonating, setImpersonating] = useState<string|null>(null)

  const load = () => { setLoading(true); fetch('/api/platform/admins').then(r=>r.status===401?(router.replace('/platform/login'),null):r.json()).then(d=>{if(d)setAdmins(d.admins)}).finally(()=>setLoading(false)) }
  useEffect(load, [router])
  useEffect(() => { fetch('/api/platform/auth/me').then(r=>r.json()).then(d=>{if(d.admin)setCurrentRole(d.admin.role)}) }, [])

  const handleCreate = async (e:React.FormEvent) => {
    e.preventDefault(); setCreating(true); setCreateMsg(null)
    const r = await fetch('/api/platform/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}).then(x=>x.json())
    setCreating(false)
    if(r.admin){setCreateMsg({ok:true,text:'帳號建立成功'});setShowForm(false);setForm({email:'',password:'',name:'',role:'SUB_ADMIN',parentId:'',tenantSlug:'',brandName:'',liffId:'',primaryColor:'#FFC107'});load()}
    else setCreateMsg({ok:false,text:r.error??'建立失敗'})
  }
  const handleToggle = async (id:string,isActive:boolean) => { await fetch(`/api/platform/admins/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isActive:!isActive})}); load() }
  const handleSaveRebate = async (id:string) => {
    setSavingRebate(true); setRebateError(null)
    const pct=parseFloat(rebateInput); if(isNaN(pct)||pct<0||pct>30){setRebateError('請輸入 0 ~ 30 之間的數值');setSavingRebate(false);return}
    const r=await fetch(`/api/platform/admins/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({maxRebateRate:pct/100})}).then(x=>x.json())
    setSavingRebate(false); if(r.ok){setEditingRebate(null);load()}else setRebateError(r.error??'設定失敗')
  }
  const handleDelete = async () => {
    if(!deleteTarget)return; setDeleting(true); setDeleteError(null)
    const r=await fetch(`/api/platform/admins/${deleteTarget.id}`,{method:'DELETE'}).then(x=>x.json())
    setDeleting(false); if(r.ok){setDeleteTarget(null);load()}else setDeleteError(r.error??'移除失敗')
  }
  const handleImpersonate = async (id: string) => {
    setImpersonating(id)
    const r = await fetch('/api/platform/auth/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: id }),
    }).then(x => x.json())
    setImpersonating(null)
    if (r.ok) { window.location.href = '/platform' }
    else alert(r.error ?? '切換失敗')
  }
  return (
    <div className="space-y-5">
      {/* Delete modal */}
      {deleteTarget&&(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">確認移除帳號</h2>
            <p className="text-sm text-gray-500 mb-4">即將移除 <span className="font-semibold text-gray-800">{deleteTarget.name}</span>（{deleteTarget.email}），此操作無法復原。</p>
            {deleteError&&<p className="text-sm text-red-500 mb-3">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={()=>{setDeleteTarget(null);setDeleteError(null)}} disabled={deleting} className="px-4 py-2 rounded-xl text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">取消</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-medium">{deleting?'移除中…':'確認移除'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-800">帳號管理</h1><p className="text-sm text-gray-400 mt-0.5">共 {admins.length} 個帳號</p></div>
        <button onClick={()=>{setShowForm(p=>!p);setCreateMsg(null)}}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${showForm?'bg-gray-100 text-gray-600':'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={showForm?"M6 18L18 6M6 6l12 12":"M12 4v16m8-8H4"}/></svg>
          {showForm?'收起':'新增帳號'}
        </button>
      </div>

      {/* Create form */}
      {showForm&&(
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">建立新帳號</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {([{label:'姓名',key:'name',type:'text'},{label:'電子郵件',key:'email',type:'email'},{label:'密碼',key:'password',type:'password'}] as {label:string;key:string;type:string}[]).map(f=>(
                <div key={f.key}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input type={f.type} value={form[f.key as keyof typeof form]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 block mb-1">角色</label>
                <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value,parentId:''}))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                  {currentRole==='SUPER_ADMIN'&&<option value="SUPER_ADMIN">Super Admin</option>}
                  <option value="PLATFORM_ADMIN">Platform Admin</option>
                  <option value="SUB_ADMIN">Sub Admin</option>
                </select>
              </div>
              {form.role==='SUB_ADMIN'&&currentRole==='SUPER_ADMIN'&&(
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">所屬 Platform <span className="text-red-400">*</span></label>
                  <select value={form.parentId} onChange={e=>setForm(p=>({...p,parentId:e.target.value}))} required={form.role==='SUB_ADMIN'&&currentRole==='SUPER_ADMIN'}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-white">
                    <option value="">— 選擇 Platform Admin —</option>
                    {admins.filter(a=>a.role==='PLATFORM_ADMIN'&&a.isActive).map(a=>(
                      <option key={a.id} value={a.id}>{a.name}（{a.email}）</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-0.5">Sub Admin 將只能查看此 Platform 的資料</p>
                </div>
              )}
            </div>
            {form.role==='PLATFORM_ADMIN'&&(
              <div className="border-t border-gray-100 pt-4 mt-2">
                <p className="text-xs text-blue-600 font-semibold mb-3 uppercase tracking-wide">Platform 設定</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Tenant Slug <span className="text-red-400">*</span></label>
                    <input type="text" placeholder="e.g. travel-bee" value={form.tenantSlug} onChange={e=>setForm(p=>({...p,tenantSlug:e.target.value}))} required={form.role==='PLATFORM_ADMIN'}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"/>
                    <p className="text-xs text-gray-400 mt-0.5">LIFF URL: /liff/<span className="font-mono">{form.tenantSlug||'slug'}</span></p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">品牌名稱 <span className="text-red-400">*</span></label>
                    <input type="text" placeholder="e.g. Bee旅" value={form.brandName} onChange={e=>setForm(p=>({...p,brandName:e.target.value}))} required={form.role==='PLATFORM_ADMIN'}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">LIFF ID <span className="text-red-400">*</span></label>
                    <input type="text" placeholder="e.g. 1234567890-abcdefgh" value={form.liffId} onChange={e=>setForm(p=>({...p,liffId:e.target.value}))} required={form.role==='PLATFORM_ADMIN'}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">品牌主色</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.primaryColor} onChange={e=>setForm(p=>({...p,primaryColor:e.target.value}))}
                        className="w-10 h-9 border border-gray-200 rounded-xl cursor-pointer p-1"/>
                      <input type="text" value={form.primaryColor} onChange={e=>setForm(p=>({...p,primaryColor:e.target.value}))}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"/>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {createMsg&&<p className={`text-sm font-medium ${createMsg.ok?'text-green-600':'text-red-500'}`}>{createMsg.ok?'✅':'❌'} {createMsg.text}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition">{creating?'建立中…':'建立帳號'}</button>
              <button type="button" onClick={()=>setShowForm(false)} className="bg-gray-100 text-gray-600 px-5 py-2 rounded-xl text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['帳號','角色','讓利上限','上層帳號','狀態','建立時間','操作'].map(h=>(
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map(a=>(
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarCls(a.name)} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-xs font-bold">{initials(a.name)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{a.name}</p>
                        <p className="text-xs text-gray-400">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${ROLE_CLS[a.role]??'bg-gray-100 text-gray-500'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>{ROLE_LABEL[a.role]??a.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {a.role==='PLATFORM_ADMIN'?(
                      editingRebate===a.id?(
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={30} step={1} value={rebateInput} onChange={e=>setRebateInput(e.target.value)}
                              className="w-14 border border-gray-200 rounded-lg px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                            <span className="text-xs text-gray-400">%</span>
                            <button onClick={()=>handleSaveRebate(a.id)} disabled={savingRebate} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg disabled:opacity-50">{savingRebate?'…':'存'}</button>
                            <button onClick={()=>{setEditingRebate(null);setRebateError(null)}} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                          </div>
                          {rebateError&&<p className="text-red-500 text-xs">{rebateError}</p>}
                        </div>
                      ):(
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-blue-600">{Math.round(Number(a.maxRebateRate)*100)}%</span>
                          {currentRole==='SUPER_ADMIN'&&(
                            <button onClick={()=>{setEditingRebate(a.id);setRebateInput(String(Math.round(Number(a.maxRebateRate)*100)));setRebateError(null)}}
                              className="text-gray-300 hover:text-blue-500 transition" title="編輯讓利上限">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                          )}
                        </div>
                      )
                    ):<span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{a.parent?.name??'—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${a.isActive?'bg-green-50 text-green-600':'bg-gray-100 text-gray-400'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>{a.isActive?'啟用中':'已停用'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString('zh-TW')}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {a.role==='PLATFORM_ADMIN'&&currentRole==='SUPER_ADMIN'&&(
                        <>
                          <Link href={`/platform/admins/${a.id}`} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition whitespace-nowrap">設定</Link>
                          <button
                            onClick={() => handleImpersonate(a.id)}
                            disabled={impersonating === a.id || !a.isActive}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            {impersonating === a.id ? (
                              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round"/></svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                            )}
                            進入後台
                          </button>
                        </>
                      )}
                      {a.role!=='SUPER_ADMIN'&&(
                        <button onClick={()=>handleToggle(a.id,a.isActive)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${a.isActive?'bg-amber-50 text-amber-600 hover:bg-amber-100':'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                          {a.isActive?'停用':'啟用'}
                        </button>
                      )}
                      {a.role!=='SUPER_ADMIN'&&currentRole==='SUPER_ADMIN'&&(
                        <button onClick={()=>{setDeleteTarget(a);setDeleteError(null)}} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-500 hover:bg-red-100 transition whitespace-nowrap">移除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {admins.length===0&&<div className="text-center py-12"><p className="text-gray-400 text-sm">目前沒有帳號資料</p></div>}
        </div>
      )}
    </div>
  )
}
