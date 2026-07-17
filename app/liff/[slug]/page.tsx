'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenant, useTenantColors } from '@/components/liff/TenantContext'
import { HOME_TEMPLATES } from '@/components/liff/templates/registry'
import SetupModal from '@/components/liff/SetupModal'
import { BeeLogoSVG } from '@/components/liff/LiffIllustrations'
import { hasSeenSplash, markSplashSeen } from '@/lib/utils/splash'
import { setCache, productsCacheKey } from '@/hooks/useCachedData'
import type { HomeCountry } from '@/components/liff/templates/home/types'

// 主頁熱門目的地的本機快取：一開就用上次存的清單瞬間顯示，再背景抓 /api/countries 更新。
// 以 slug 分租戶（避免切品牌看到別家）；國家清單是公開資料、非個資，故不綁 LINE 使用者。
// 版本前綴 v1 便於日後資料改版時自然作廢。
const HOME_COUNTRIES_KEY = (slug: string) => `esim_home_countries_v1_${slug}`
function readCachedHomeCountries(slug: string): HomeCountry[] {
  if (typeof window === 'undefined' || !slug) return []
  try {
    const raw = window.localStorage.getItem(HOME_COUNTRIES_KEY(slug))
    const arr = raw ? JSON.parse(raw) : null
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function writeCachedHomeCountries(slug: string, list: HomeCountry[]): void {
  if (typeof window === 'undefined' || !slug) return
  try { window.localStorage.setItem(HOME_COUNTRIES_KEY(slug), JSON.stringify(list)) } catch {}
}

export default function LiffHomePage() {
  const { isReady, error } = useLiff()
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const tenant = useTenant()
  const C = useTenantColors()

  const brandName = tenant?.brandName ?? 'eSIM'
  const primary   = tenant?.primaryColor ?? '#0284c7'

  // ── 過場：只有「本次 session 第一次」進入才播放 ──
  // 用 sessionStorage 記錄已看過；之後在 App 內回到主頁直接略過過場，
  // 只有重新點擊網址（開新分頁／新 session）才會再看到。
  // 用 lazy initializer 同步讀取，避免回訪時閃一下白色過場畫面。
  const [splashOut, setSplashOut] = useState(false)
  const [splashDone, setSplashDone] = useState<boolean>(hasSeenSplash)

  useEffect(() => {
    if (splashDone) return  // 本 session 已看過 → 不再播放
    markSplashSeen()
    const t1 = setTimeout(() => setSplashOut(true), 700)
    const t2 = setTimeout(() => setSplashDone(true), 1060)  // 700 + 360 fade
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // 僅在首次 mount 評估一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 資料抓取 ──
  // lazy initializer 同步讀本機快取 → 回訪時熱門目的地「一開就顯示」，不必等網路
  const [countries, setCountries] = useState<HomeCountry[]>(() => readCachedHomeCountries(slug))
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    if (!isReady) return
    // me（是否彈設定視窗）、countries（熱門目的地）並行；商品全量背景預熱不阻塞畫面。
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
      // profileComplete 在 me.user 底下（過去誤讀 me.profileComplete → 永遠 undefined）
      .then(me => { if (me?.user && !me.user.profileComplete) setShowSetup(true) })
      .catch(() => {})
    // 熱門目的地只需「國家 + 各國最低價」（約數十筆）→ 用輕量端點秒顯示，
    // 不再等上萬筆 /api/products。
    fetch('/api/countries').then(r => r.json())
      .then(cd => {
        const list: HomeCountry[] = cd.countries ?? []
        setCountries(list)
        writeCachedHomeCountries(slug, list)  // 存起來供下次「一開就顯示」
      })
      .catch(() => {})
    // 背景預熱商品頁 cache（全量），不阻塞熱門目的地；products 頁掛載時可直接吃這份。
    fetch('/api/products').then(r => r.json())
      .then(data => setCache(productsCacheKey(), data))
      .catch(() => {})
  }, [isReady])

  function handleNavigate(path: string) {
    const routes: Record<string, string> = {
      orders:  `/liff/${slug}/orders`,
      products:`/liff/${slug}/products`,
      profile: `/liff/${slug}/profile`,
      guide:   `/liff/${slug}/guide`,
      data:    `/liff/${slug}/support`,
      devices: `/liff/${slug}/devices`,
    }
    router.push(routes[path] ?? `/liff/${slug}/${path}`)
  }

  const templateKey = tenant?.homeTemplate ?? 'landmark'
  const HomeTemplate = HOME_TEMPLATES[templateKey]

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <p style={{ color: '#ef4444', fontSize: 14, textAlign: 'center' }}>{error}</p>
      </div>
    )
  }

  return (
    <>
      {/* ── 過場 Splash（每次 mount 都出現）── */}
      {!splashDone && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#ffffff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
          transition: 'opacity 0.36s ease',
          opacity: splashOut ? 0 : 1,
          pointerEvents: splashOut ? 'none' : 'auto',
        }}>
          {/* 旋轉圓環 + Logo */}
          <div style={{ position: 'relative', width: 100, height: 100 }}>
            <svg width="100" height="100" style={{ position: 'absolute', inset: 0, animation: 'spinRing 2s linear infinite' }}>
              <circle cx="50" cy="50" r="44" fill="none" stroke={primary} strokeWidth="2.5"
                strokeDasharray="55 221" strokeLinecap="round" opacity="0.6"/>
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {tenant?.logoUrl
                ? <img src={tenant.logoUrl} alt={brandName} style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 16 }} />
                : <BeeLogoSVG size={54} />
              }
            </div>
          </div>

          {/* 品牌名 */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>{brandName}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0', letterSpacing: '0.1em' }}>旅遊 eSIM 專門店</p>
          </div>

          {/* 跳動點 */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: primary,
                animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}/>
            ))}
          </div>

          <style>{`
            @keyframes spinRing { to{transform:rotate(360deg)} }
            @keyframes dotPulse { 0%,80%,100%{transform:scale(0.6);opacity:0.35} 40%{transform:scale(1.3);opacity:1} }
          `}</style>
        </div>
      )}

      {/* ── 首頁主體（過場進行中也在背景渲染）── */}
      <div style={{ opacity: splashDone ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        {showSetup && (
          <SetupModal slug={slug} onDismiss={() => setShowSetup(false)} colors={C} logoUrl={tenant?.logoUrl ?? null} />
        )}
        <HomeTemplate
          tenant={tenant}
          slug={slug}
          countries={countries}
          colors={C}
          showSetup={showSetup}
          onDismissSetup={() => setShowSetup(false)}
          onSelectCountry={code => router.push(`/liff/${slug}/products?country=${encodeURIComponent(code)}`)}
          onNavigate={handleNavigate}
          onSearch={q => router.push(`/liff/${slug}/products${q}`)}
        />
      </div>
    </>
  )
}
