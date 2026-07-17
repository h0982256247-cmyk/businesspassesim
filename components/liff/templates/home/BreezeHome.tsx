'use client'

import { useState } from 'react'
import { BeeLogoSVG } from '@/components/liff/LiffIllustrations'
import { IconMyEsim, IconGuide, IconDataPlan, IconDevices } from './HomeIcons'
import FilterDropdown from './FilterDropdown'
import { CountryFlag } from '@/components/common/CountryFlag'
import type { HomePageProps } from './types'

const QUICK_ACTIONS = [
  { key: 'orders',  label: '我的 eSIM', Icon: IconMyEsim,   bg: '#EFF6FF', color: '#2563eb' },
  { key: 'guide',   label: '安裝教學',  Icon: IconGuide,    bg: '#F0FDF4', color: '#16a34a' },
  { key: 'data',    label: '流量指南',  Icon: IconDataPlan, bg: '#FFF7ED', color: '#ea580c' },
  { key: 'devices', label: '支援裝置',  Icon: IconDevices,  bg: '#F5F3FF', color: '#7c3aed' },
]

const DAY_OPTIONS  = ['3天','5天','7天','10天','15天']
const DATA_OPTIONS = ['總量','每日型','吃到飽']

const BREEZE_GRADS = ['#FFF7ED','#F0FDF4','#EFF6FF','#FDF4FF','#F0FDFA','#FFFBEB']
function getBreezeGrad(code: string) {
  let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff
  return BREEZE_GRADS[Math.abs(h) % BREEZE_GRADS.length]
}

export default function BreezeHome({
  tenant, countries, colors: C, onSelectCountry, onNavigate, onSearch,
}: HomePageProps) {
  const [query, setQuery] = useState('')
  const [selDays, setSelDays] = useState<string | null>(null)
  const [selData, setSelData] = useState<string | null>(null)
  // 點下拉先「記住」國家而不直接跳頁，讓使用者接著選天數/流量再按搜尋（對齊 ClassicHome）
  const [selCountry, setSelCountry] = useState<{ code: string; name: string } | null>(null)
  const brandName = tenant?.brandName ?? 'eSIM'

  const filtered = query.trim()
    ? countries.filter(c =>
        c.countryNameZh.includes(query) ||
        c.countryNameEn.toLowerCase().includes(query.toLowerCase()))
    : []

  const hot = countries.slice(0, 6)

  function handleSearch() {
    // 國家：優先用下拉點選的；沒點則用輸入字串比對到的第一個
    const country = selCountry ?? (filtered[0] ? { code: filtered[0].countryCode, name: filtered[0].countryNameZh } : null)
    const params = new URLSearchParams()
    if (country) params.set('country', country.code)
    if (selDays) params.set('days', selDays.replace('天', ''))
    if (selData) params.set('data', selData)   // 總量 / 每日型 / 吃到飽
    onSearch(params.toString() ? `?${params}` : '')
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', paddingBottom: 88 }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 2px ${C.border}` }}>
            {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={brandName} style={{ width: 40, height: 40, objectFit: 'cover' }} /> : <BeeLogoSVG size={24} />}
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, letterSpacing: '0.04em' }}>歡迎回來</p>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>{brandName}</p>
          </div>
        </div>
        <button onClick={() => onNavigate('orders')} style={{ background: C.light, border: 'none', borderRadius: 12, width: 38, height: 38, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </button>
      </div>

      {/* 搜尋區塊 */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', gap: 8, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <div style={{
              background: '#F7F8FA', borderRadius: 14,
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text" placeholder="你要去哪裡？"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelCountry(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 16, color: '#111', padding: '13px 0', minWidth: 0 }}
              />
              {query && (
                <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                </button>
              )}
            </div>

            {/* 搜尋下拉（已選定國家後收起，讓使用者接著選天數/流量）*/}
            {filtered.length > 0 && !selCountry && (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 30,
                background: '#fff', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', animation: 'dropIn 0.15s ease',
              }}>
                {filtered.map((c, i) => (
                  <button key={c.countryCode} onClick={() => { setSelCountry({ code: c.countryCode, name: c.countryNameZh }); setQuery(c.countryNameZh) }}
                    style={{
                      width: '100%', background: 'none', border: 'none',
                      borderBottom: i < filtered.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                    <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={28} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: 0 }}>{c.countryNameZh}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{c.countryNameEn}</p>
                    </div>
                    {c.minPrice && <span style={{ fontSize: 13, fontWeight: 700, color: C.primary }}>NT${c.minPrice}起</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleSearch}
            style={{
              background: C.primary, border: 'none', borderRadius: 14,
              padding: '0 18px', cursor: 'pointer', flexShrink: 0, height: 48,
              color: '#fff', fontWeight: 700, fontSize: 15,
              boxShadow: `0 4px 14px ${C.primary}40`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            搜尋
          </button>
        </div>

        {/* 篩選下拉 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <FilterDropdown label="天數" options={DAY_OPTIONS} value={selDays} onChange={setSelDays} primary={C.primary} />
          <FilterDropdown label="流量" options={DATA_OPTIONS} value={selData} onChange={setSelData} primary={C.primary} />
        </div>
      </div>

      {/* 快速功能 */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {QUICK_ACTIONS.map(({ key, label, Icon, bg, color }, i) => (
            <button key={key} onClick={() => onNavigate(key)}
              style={{
                background: bg, border: 'none', borderRadius: 18,
                padding: '14px 4px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor: 'pointer',
                animation: `popIn 0.4s ${i * 0.06}s cubic-bezier(0.34,1.56,0.64,1) both`,
              }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon color={color} size={22} />
              </div>
              <span style={{ fontSize: 10, color: '#374151', fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 熱門目的地 */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#111', letterSpacing: '-0.02em' }}>熱門目的地</span>
          <button onClick={() => onNavigate('products')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.primary, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
            查看全部 →
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hot.map((c, i) => (
            <button key={c.countryCode} onClick={() => onSelectCountry(c.countryCode)}
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                background: '#F7F8FA', borderRadius: 16, padding: '14px 16px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
                animation: `slideIn 0.4s ${0.05 + i * 0.04}s ease both`,
              }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: getBreezeGrad(c.countryCode), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={32} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111', margin: 0 }}>{c.countryNameZh}</p>
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{c.countryNameEn}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {c.minPrice ? (
                  <>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>起價</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: C.primary, margin: 0 }}>NT${c.minPrice}</p>
                  </>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes popIn  { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        @keyframes slideIn{ from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
        @keyframes dropIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}
