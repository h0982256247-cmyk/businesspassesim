'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/platform/Toast'
import { APPEARANCE } from '@/lib/utils/appearance'
import { resizeToBlob } from '@/lib/utils/image'

interface CountryImg {
  code: string
  nameZh: string
  imageUrl: string | null       // 後台上傳的覆寫
  defaultImageUrl: string | null // 內建預設
}

export default function AppearancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [homeHeroUrl, setHomeHeroUrl] = useState<string | null>(null)
  const [shopHeroUrl, setShopHeroUrl] = useState<string | null>(null)
  const [defaultHomeHeroUrl, setDefaultHomeHeroUrl] = useState<string | null>(null)
  const [countries, setCountries] = useState<CountryImg[]>([])
  const [q, setQ] = useState('')
  // 每個目標各自的忙碌狀態：'home' | 'shop' | `dest:<code>`
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const authed = (r: Response) => { if (r.status === 401) { router.replace('/platform/login'); return false } return true }
  const setBusyFor = (key: string, v: boolean) => setBusy(p => ({ ...p, [key]: v }))

  useEffect(() => {
    fetch('/api/platform/appearance').then(r => (authed(r) ? r.json() : null)).then(d => {
      if (!d) return
      setHomeHeroUrl(d.homeHeroUrl ?? null)
      setShopHeroUrl(d.shopHeroUrl ?? null)
      setDefaultHomeHeroUrl(d.defaultHomeHeroUrl ?? null)
      setCountries(d.countries ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function doUpload(kind: 'home' | 'shop' | 'dest', file: File, maxEdge: number, code?: string) {
    const key = kind === 'dest' ? `dest:${code}` : kind
    if (!file.type.startsWith('image/')) { toast.error('請選擇圖片檔'); return }
    if (file.size > 15 * 1024 * 1024) { toast.error('原圖請小於 15MB'); return }
    setBusyFor(key, true)
    try {
      const blob = await resizeToBlob(file, maxEdge)
      const fd = new FormData()
      fd.append('kind', kind)
      if (code) fd.append('code', code)
      fd.append('file', blob, 'upload.jpg')
      const r = await fetch('/api/platform/appearance', { method: 'POST', body: fd })
      if (!authed(r)) return
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error ?? '上傳失敗'); return }
      const url: string = d.url
      if (kind === 'home') setHomeHeroUrl(url)
      else if (kind === 'shop') setShopHeroUrl(url)
      else setCountries(list => list.map(c => (c.code === code ? { ...c, imageUrl: url } : c)))
      toast.success('已更新 ✓')
    } catch { toast.error('圖片處理失敗，請換一張試試') }
    finally { setBusyFor(key, false) }
  }

  async function doRemove(kind: 'home' | 'shop' | 'dest', code?: string) {
    const key = kind === 'dest' ? `dest:${code}` : kind
    setBusyFor(key, true)
    try {
      const qs = new URLSearchParams({ kind })
      if (code) qs.set('code', code)
      const r = await fetch(`/api/platform/appearance?${qs}`, { method: 'DELETE' })
      if (!authed(r)) return
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error ?? '移除失敗'); return }
      if (kind === 'home') setHomeHeroUrl(null)
      else if (kind === 'shop') setShopHeroUrl(null)
      else setCountries(list => list.map(c => (c.code === code ? { ...c, imageUrl: null } : c)))
      toast.success('已還原預設 ✓')
    } finally { setBusyFor(key, false) }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return countries
    return countries.filter(c => c.nameZh.toLowerCase().includes(s) || c.code.toLowerCase().includes(s))
  }, [q, countries])

  const customCount = countries.filter(c => c.imageUrl).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">前台外觀</h1>
        <p className="text-sm text-gray-500 mt-1">主頁首圖、商城頂端圖、各國家圖片。留空則沿用系統內建預設，不會破圖。</p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">載入中…</div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-5">
            <HeroCard
              title="主頁首圖"
              sizeLabel={APPEARANCE.home.label}
              note="文字疊在左側，主體請靠右"
              ratio={APPEARANCE.home.ratio}
              currentUrl={homeHeroUrl ?? defaultHomeHeroUrl}
              isCustom={!!homeHeroUrl}
              busy={!!busy.home}
              onPick={f => doUpload('home', f, APPEARANCE.home.maxEdge)}
              onRemove={homeHeroUrl ? () => doRemove('home') : undefined}
            />
            <HeroCard
              title="商城頂端圖"
              sizeLabel={APPEARANCE.shop.label}
              note="未設圖時顯示品牌漸層底；主體請置中"
              ratio={APPEARANCE.shop.ratio}
              currentUrl={shopHeroUrl}
              isCustom={!!shopHeroUrl}
              busy={!!busy.shop}
              onPick={f => doUpload('shop', f, APPEARANCE.shop.maxEdge)}
              onRemove={shopHeroUrl ? () => doRemove('shop') : undefined}
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-gray-800">國家圖片</h2>
                <SizePill label={APPEARANCE.dest.label} />
                <span className="text-xs text-gray-400">{countries.length} 國 · 已自訂 {customCount}</span>
              </div>
              <input
                value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋國家名稱或代碼…"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                {countries.length === 0 ? '目前沒有上架商品，先到「商品管理」新增方案後，國家會自動出現在這裡。' : '找不到符合的國家'}
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map(c => (
                  <CountryCell
                    key={c.code}
                    c={c}
                    busy={!!busy[`dest:${c.code}`]}
                    onPick={f => doUpload('dest', f, APPEARANCE.dest.maxEdge, c.code)}
                    onRemove={c.imageUrl ? () => doRemove('dest', c.code) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SizePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
      </svg>
      {label}
    </span>
  )
}

function PickButton({ label, busy, onPick }: { label: string; busy: boolean; onPick: (f: File) => void }) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = '' // 允許重選同一張
    if (f) onPick(f)
  }
  return (
    <label className={`cursor-pointer inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition ${busy ? 'bg-gray-100 text-gray-400 cursor-default' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
      {busy ? '處理中…' : label}
      <input type="file" accept="image/*" className="hidden" onChange={onChange} disabled={busy} />
    </label>
  )
}

function HeroCard({
  title, sizeLabel, note, ratio, currentUrl, isCustom, busy, onPick, onRemove,
}: {
  title: string; sizeLabel: string; note?: string; ratio: number
  currentUrl: string | null; isCustom: boolean; busy: boolean
  onPick: (f: File) => void; onRemove?: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        <SizePill label={sizeLabel} />
        <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium ${isCustom ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
          {isCustom ? '已自訂' : '預設'}
        </span>
      </div>
      <div className="relative w-full rounded-xl overflow-hidden bg-gray-50 ring-1 ring-gray-200/70" style={{ aspectRatio: String(ratio) }}>
        {currentUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt={title} className="w-full h-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm whitespace-nowrap">建議 {sizeLabel}</span>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-400">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">建議 {sizeLabel}</span>
          </div>
        )}
      </div>
      {note && <p className="text-xs text-gray-400">{note}</p>}
      <div className="flex items-center gap-3 pt-0.5">
        <PickButton label={isCustom ? '更換圖片' : '上傳圖片'} busy={busy} onPick={onPick} />
        {onRemove && <button type="button" onClick={onRemove} disabled={busy} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">還原預設</button>}
      </div>
    </div>
  )
}

function CountryCell({
  c, busy, onPick, onRemove,
}: {
  c: CountryImg; busy: boolean; onPick: (f: File) => void; onRemove?: () => void
}) {
  const effective = c.imageUrl ?? c.defaultImageUrl
  const badge = c.imageUrl ? { t: '自訂', cls: 'bg-blue-50 text-blue-600' }
    : c.defaultImageUrl ? { t: '預設', cls: 'bg-gray-100 text-gray-500' }
    : { t: '色塊', cls: 'bg-amber-50 text-amber-600' }
  return (
    <div className="border border-gray-100 rounded-xl p-3 flex gap-3">
      <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
        {effective
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={effective} alt={c.nameZh} className="w-full h-full object-cover" />
          : <span className="text-[10px] text-gray-300">無圖</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-800 truncate">{c.nameZh}</span>
          <span className="text-[10px] text-gray-400">{c.code}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.cls} ml-auto flex-shrink-0`}>{badge.t}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <PickButton label={c.imageUrl ? '更換' : '上傳'} busy={busy} onPick={onPick} />
          {onRemove && <button type="button" onClick={onRemove} disabled={busy} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">還原</button>}
        </div>
      </div>
    </div>
  )
}
