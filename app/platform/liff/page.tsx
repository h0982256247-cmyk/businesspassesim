'use client'

import { useState, useEffect, useRef } from 'react'
import {
  HOME_TEMPLATE_META, PRODUCTS_TEMPLATE_META,
} from '@/components/liff/templates/registry'
import type { HomeTemplate, ProductsTemplate } from '@/components/liff/TenantContext'

const HOME_PREVIEW: Record<string, { bg: string }> = {
  landmark: { bg: 'linear-gradient(160deg,#FAF9F6,#fff)' },
  gradient: { bg: 'linear-gradient(160deg,#0a0a0f,#1e1b4b)' },
  minimal:  { bg: 'linear-gradient(160deg,#ffffff,#f7f8fa)' },
}
const PRODUCTS_PREVIEW: Record<string, { accent: string }> = {
  classic:  { accent: '#0284c7' },
  magazine: { accent: '#f59e0b' },
  compact:  { accent: '#6366f1' },
}

export default function LiffSettingsPage() {
  const [liffId, setLiffId]   = useState('')
  const [adminId, setAdminId] = useState('')
  const [copied, setCopied]   = useState<string | null>(null)

  // ── 品牌欄位 ──
  const [brandName,    setBrandName]    = useState('')
  const [logoUrl,      setLogoUrl]      = useState('')
  const [primaryColor, setPrimaryColor] = useState('#0284c7')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError,     setLogoError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 模板 ──
  const [homeTemplate,     setHomeTemplate]     = useState<HomeTemplate | null>(null)
  const [productsTemplate, setProductsTemplate] = useState<ProductsTemplate | null>(null)

  // ── 儲存狀態 ──
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/platform/appearance').then(r => r.json()).then(d => {
      if (d.liffId)          setLiffId(d.liffId)   // 該租戶自己的 LIFF ID（不再讀全域 env）
      if (d.adminId)         setAdminId(d.adminId)
      if (d.homeTemplate)    setHomeTemplate(d.homeTemplate)
      if (d.productsTemplate) setProductsTemplate(d.productsTemplate)
      if (d.brandName)    setBrandName(d.brandName)
      if (d.logoUrl)      setLogoUrl(d.logoUrl)
      if (d.primaryColor) setPrimaryColor(d.primaryColor)
    })
  }, [])

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  // ── Logo 上傳 ──
  async function handleLogoFile(file: File) {
    setLogoError('')
    const ALLOWED = ['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
    if (!ALLOWED.includes(file.type)) { setLogoError('僅支援 PNG / JPG / WebP / SVG'); return }
    if (file.size > 2 * 1024 * 1024)  { setLogoError('檔案大小不可超過 2 MB'); return }
    if (!adminId) { setLogoError('無法取得管理員 ID，請重新整理'); return }

    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('adminId', adminId)
      const res = await fetch('/api/platform/upload/logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setLogoError(data.error ?? '上傳失敗'); return }
      setLogoUrl(data.url)
    } catch {
      setLogoError('上傳失敗，請稍後再試')
    } finally {
      setLogoUploading(false)
    }
  }

  // ── 儲存全部設定 ──
  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/platform/appearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTemplate, productsTemplate,
          brandName, logoUrl, primaryColor,
        }),
      })
      setSaveMsg(res.ok ? 'saved' : 'error')
    } catch {
      setSaveMsg('error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 2500)
    }
  }

  const CopyBtn = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copy(text, id)}
      className="text-xs text-gray-400 hover:text-blue-600 transition px-1.5 py-0.5 rounded hover:bg-blue-50 flex-shrink-0"
    >
      {copied === id ? '✓ 已複製' : '複製'}
    </button>
  )

  const SaveBtn = (
    <button
      onClick={handleSave}
      disabled={saving}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition
        ${saving ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : saveMsg === 'saved' ? 'bg-green-100 text-green-700'
          : saveMsg === 'error' ? 'bg-red-100 text-red-600'
          : 'bg-blue-600 text-white hover:bg-blue-700'}`}
    >
      {saving ? '儲存中…' : saveMsg === 'saved' ? '✓ 已儲存' : saveMsg === 'error' ? '儲存失敗' : '儲存設定'}
    </button>
  )

  const liffUrl = liffId ? `https://liff.line.me/${liffId}` : '（請先到「帳號管理 → 品牌設定」填入此商店的 LIFF ID）'

  return (
    <div className="max-w-3xl space-y-8">

      {/* ── 標題 + LIFF 連結 ── */}
      <div>
        <h1 className="text-2xl font-bold">LIFF 前台設定</h1>
        <div className="mt-4 bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">LIFF 分享連結</span>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">分享給使用者</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-sm font-mono text-gray-800 break-all">{liffUrl}</code>
            {liffId && <CopyBtn text={liffUrl} id="liffurl" />}
          </div>
        </div>
      </div>

      {/* ── 品牌設定（可編輯）── */}
      <section className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">品牌設定</h2>
            <p className="text-xs text-gray-400 mt-0.5">設定前台顯示的品牌識別資訊</p>
          </div>
          {SaveBtn}
        </div>

        <div className="p-6 space-y-6">

          {/* 品牌名稱 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">品牌名稱</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="例如：Bee旅"
              className="w-full border rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Logo 圖片 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo 圖片</label>

            {/* 上傳按鈕 */}
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={logoUploading}
                className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition disabled:opacity-50"
              >
                {logoUploading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round"/>
                    </svg>
                    上傳中…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    選擇圖片上傳
                  </>
                )}
              </button>
              <span className="text-xs text-gray-400">PNG / JPG / WebP / SVG，最大 2 MB</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = '' }} />

            {/* URL 顯示 */}
            {logoUrl && (
              <input
                type="text"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm font-mono text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              />
            )}

            {/* 預覽 + 移除 */}
            {logoUrl && (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <button
                  onClick={() => setLogoUrl('')}
                  className="text-sm text-red-500 hover:text-red-700 font-medium"
                >
                  移除
                </button>
              </div>
            )}

            {logoError && <p className="mt-2 text-xs text-red-500">{logoError}</p>}
          </div>

          {/* 主題色 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">主題色</label>
            <div className="flex items-center gap-3">
              {/* 色彩選擇器 */}
              <label className="cursor-pointer flex-shrink-0">
                <div
                  className="w-14 h-10 rounded-xl border-2 border-gray-200 overflow-hidden"
                  style={{ background: primaryColor }}
                />
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimaryColor(e.target.value)}
                  className="sr-only"
                />
              </label>
              {/* Hex 輸入 */}
              <input
                type="text"
                value={primaryColor}
                onChange={e => {
                  const v = e.target.value
                  setPrimaryColor(v)
                }}
                placeholder="#0284c7"
                className="w-36 border rounded-xl px-4 py-2.5 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

        </div>
      </section>

      {/* ── 前台外觀模板 ── */}
      <section className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">前台外觀模板</h2>
            <p className="text-xs text-gray-400 mt-0.5">選擇首頁載入畫面與商品頁的視覺風格</p>
          </div>
          {SaveBtn}
        </div>

        <div className="p-6 space-y-8">

          {/* 首頁模板 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">首頁載入畫面</p>
            <div className="grid grid-cols-3 gap-3">
              {HOME_TEMPLATE_META.map(t => {
                const preview = HOME_PREVIEW[t.key]
                const active = (homeTemplate ?? 'landmark') === t.key
                return (
                  <button key={t.key} onClick={() => setHomeTemplate(t.key)}
                    className={`rounded-xl border-2 overflow-hidden text-left transition-all
                      ${active ? 'border-blue-500 shadow-md shadow-blue-100' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="h-24 w-full relative flex flex-col items-center justify-center gap-1.5"
                      style={{ background: preview.bg }}>
                      {t.key === 'landmark' && (
                        <div className="w-full px-2 flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex-shrink-0"/>
                            <div className="h-2 w-12 bg-gray-200 rounded-full"/>
                          </div>
                          <div className="h-10 bg-violet-200 rounded-lg"/>
                          <div className="grid grid-cols-4 gap-1">
                            {[0,1,2,3].map(i=><div key={i} className="h-5 rounded-lg bg-yellow-100"/>)}
                          </div>
                        </div>
                      )}
                      {t.key === 'gradient' && (
                        <div className="w-full px-2 flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-5 h-5 rounded-md bg-white/10 border border-white/20"/>
                            <div className="h-1.5 w-10 bg-white/30 rounded-full"/>
                          </div>
                          <div className="h-6 bg-white/10 rounded-lg border border-white/10"/>
                          <div className="flex gap-1 overflow-hidden">
                            {['#312e81','#1e3a5f','#166534'].map((c,i)=>(
                              <div key={i} className="flex-1 h-10 rounded-lg" style={{background:`linear-gradient(145deg,${c},${c}88)`}}/>
                            ))}
                          </div>
                        </div>
                      )}
                      {t.key === 'minimal' && (
                        <div className="w-full px-2 flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="w-5 h-5 rounded-full bg-gray-100 border border-gray-200"/>
                            <div className="h-1.5 w-10 bg-gray-200 rounded-full"/>
                          </div>
                          <div className="h-6 bg-gray-100 rounded-xl"/>
                          <div className="flex flex-col gap-1">
                            {[0,1,2].map(i=>(
                              <div key={i} className="h-5 bg-gray-50 rounded-lg border border-gray-100"/>
                            ))}
                          </div>
                        </div>
                      )}
                      {active && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-gray-800">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{t.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 商品頁模板 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">商品頁版型</p>
            <div className="grid grid-cols-3 gap-3">
              {PRODUCTS_TEMPLATE_META.map(t => {
                const preview = PRODUCTS_PREVIEW[t.key]
                const active = (productsTemplate ?? 'classic') === t.key
                return (
                  <button key={t.key} onClick={() => setProductsTemplate(t.key)}
                    className={`rounded-xl border-2 overflow-hidden text-left transition-all
                      ${active ? 'border-blue-500 shadow-md shadow-blue-100' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="h-24 bg-gray-50 p-2.5 flex flex-col gap-1.5 justify-center relative">
                      {t.key === 'classic' && (
                        <div className="grid grid-cols-2 gap-1">
                          {[0,1,2,3].map(i => (
                            <div key={i} className="h-6 rounded bg-white border border-gray-200 flex items-center px-1.5 gap-1">
                              <div className="w-2.5 h-2.5 rounded-sm bg-gray-200"/>
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full"/>
                            </div>
                          ))}
                        </div>
                      )}
                      {t.key === 'magazine' && (
                        <div className="flex gap-1.5 overflow-hidden">
                          {[preview.accent,'#a78bfa','#34d399'].map((c,i) => (
                            <div key={i} className="flex-shrink-0 w-14 h-16 rounded-lg flex flex-col justify-end p-1.5"
                              style={{background:`linear-gradient(135deg,${c}88,${c})`}}>
                              <div className="h-1.5 w-8 bg-white/70 rounded-full"/>
                              <div className="h-1 w-5 bg-white/50 rounded-full mt-0.5"/>
                            </div>
                          ))}
                        </div>
                      )}
                      {t.key === 'compact' && (
                        <div className="flex flex-col gap-1">
                          {[0,1,2,3].map(i => (
                            <div key={i} className="flex items-center gap-1.5 h-4">
                              <div className="w-4 h-4 rounded" style={{background:`${preview.accent}22`}}/>
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full"/>
                              <div className="w-8 h-1.5 rounded-full" style={{background:`${preview.accent}55`}}/>
                            </div>
                          ))}
                        </div>
                      )}
                      {active && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-gray-800">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{t.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </section>

    </div>
  )
}
