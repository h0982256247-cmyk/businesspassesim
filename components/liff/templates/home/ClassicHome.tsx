'use client'

import { useState } from 'react'
import { BeeLogoSVG } from '@/components/liff/LiffIllustrations'
import { IconMyEsim, IconGuide, IconDataPlan, IconDevices } from './HomeIcons'
import FilterDropdown from './FilterDropdown'
import { CountryFlag } from '@/components/common/CountryFlag'
import { resolveDestImage } from '@/lib/utils/dest-image'
import type { HomePageProps } from './types'

const QUICK_ACTIONS = [
  // 統一白底框格 + 灰色圖示底；圖示用品牌主色的不同深淺（iconShade = 疊在 C.primary 後的
  // alpha 後綴，100%→70%）做出一點層次區分，整體仍乾淨一致。主色動態帶入、不寫死品牌色。
  { key: 'orders',  label: '我的 eSIM', Icon: IconMyEsim,   iconShade: '' },
  { key: 'guide',   label: '安裝教學',  Icon: IconGuide,    iconShade: 'E6' },
  { key: 'data',    label: '流量指南',  Icon: IconDataPlan, iconShade: 'CC' },
  { key: 'devices', label: '支援裝置',  Icon: IconDevices,  iconShade: 'B3' },
]

const DAY_OPTIONS  = ['3天','5天','7天','10天','15天']
const DATA_OPTIONS = ['總量','每日型','吃到飽']

// 旅遊風統一色卡：每個國家擁有自己的「目的地色」作為頂部色條，但卡片本體
// 維持米白底以避免畫面太雜。色相控制在低飽和、柔和的旅遊感色系。
const DEST_PALETTE = [
  { accent: '#5B6CF0', soft: '#EEF0FE' }, // 靛藍
  { accent: '#0EA5B5', soft: '#E6F5F7' }, // 湖水青
  { accent: '#E0930E', soft: '#FBF2DE' }, // 旅遊金
  { accent: '#14A06B', soft: '#E7F5EE' }, // 森林綠
  { accent: '#EC6A5E', soft: '#FCEDEB' }, // 珊瑚（柔和紅）
  { accent: '#B66BC4', soft: '#F6ECF8' }, // 蘭紫（柔和粉）
]
function getAccent(code: string) {
  let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff
  return DEST_PALETTE[Math.abs(h) % DEST_PALETTE.length]
}

export default function ClassicHome({
  tenant, countries, colors: C, onSelectCountry, onNavigate, onSearch,
}: HomePageProps) {
  const [query, setQuery]       = useState('')
  const [selDays, setSelDays]   = useState<string | null>(null)
  const [selData, setSelData]   = useState<string | null>(null)
  // 點下拉選到的國家先「記住」而不是直接跳頁，讓使用者接著選天數/流量再按搜尋
  const [selCountry, setSelCountry] = useState<{ code: string; name: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(true)   // 預設展開搜尋面板
  const brandName = tenant?.brandName ?? 'eSIM'

  const filtered = query.trim()
    ? countries.filter(c =>
        c.countryNameZh.includes(query) ||
        c.countryNameEn.toLowerCase().includes(query.toLowerCase()))
    : []
  // 熱門目的地：韓國、日本固定置頂兩格（HOT），其餘照原順序補滿 6 格。
  const HOT_PINNED = ['KR', 'JP']
  const hotPinned = HOT_PINNED.flatMap(code => {
    const f = countries.find(c => c.countryCode === code)
    return f ? [f] : []
  })
  const hot = [
    ...hotPinned,
    ...countries.filter(c => !HOT_PINNED.includes(c.countryCode)),
  ].slice(0, 6)

  function handleSearch() {
    // 國家：優先用下拉點選的；沒點則用輸入字串比對到的第一個
    const country = selCountry ?? (filtered[0] ? { code: filtered[0].countryCode, name: filtered[0].countryNameZh } : null)
    const p = new URLSearchParams()
    if (country) p.set('country', country.code)
    if (selDays) p.set('days', selDays.replace('天', ''))
    if (selData) p.set('data', selData)   // 總量 / 每日型 / 吃到飽
    onSearch(p.toString() ? `?${p}` : '')
  }

  return (
    <div style={{
      background: '#EEEEF8', minHeight: '100vh', paddingBottom: 100,
      width: '100%', overflowX: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%', overflow: 'hidden',
            background: '#fff', flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.07)',
            border: '2px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {tenant?.logoUrl
              ? <img src={tenant.logoUrl} alt={brandName} style={{ width: 46, height: 46, objectFit: 'cover' }} />
              : <BeeLogoSVG size={26} />}
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, fontWeight: 500 }}>歡迎使用</p>
            <p style={{ fontSize: 19, fontWeight: 900, color: '#1a1a1a', margin: 0, letterSpacing: '-0.025em' }}>{brandName}</p>
          </div>
        </div>
        {/* Search icon toggles the search panel */}
        <button
          onClick={() => setSearchOpen(o => !o)}
          style={{
            width: 44, height: 44, borderRadius: '50%', background: '#fff',
            border: searchOpen ? `2px solid ${C.primary}` : '2px solid rgba(0,0,0,0.06)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: searchOpen ? `0 6px 16px ${C.primary}33` : '0 4px 12px rgba(0,0,0,0.07)',
            transition: 'box-shadow 0.2s, border 0.2s',
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={searchOpen ? C.primary : '#374151'} strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </div>

      {/* ── Search Panel (collapsible) ── */}
      {searchOpen && (
        <div style={{ padding: '14px 20px 0', animation: 'dropIn 0.18s ease' }}>
          <div style={{ display: 'flex', gap: 8, width: '100%', boxSizing: 'border-box' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <div style={{
                background: '#fff', borderRadius: 18, display: 'flex', alignItems: 'center',
                gap: 10, padding: '0 14px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                border: '2px solid rgba(0,0,0,0.07)',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text" placeholder="搜尋目的地，例如：日本"
                  autoFocus value={query}
                  onChange={e => { setQuery(e.target.value); setSelCountry(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: 16, color: '#1a1a1a', padding: '13px 0', minWidth: 0 }}
                />
                {query && (
                  <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', flexShrink: 0, display: 'flex' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* 搜尋下拉結果（已選定國家後收起，讓使用者接著選天數/流量）*/}
              {filtered.length > 0 && !selCountry && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
                  background: '#fff', borderRadius: 18, overflow: 'hidden',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.12)', animation: 'dropIn 0.15s ease',
                }}>
                  {filtered.map((c, i) => (
                    <button key={c.countryCode}
                      onClick={() => { setSelCountry({ code: c.countryCode, name: c.countryNameZh }); setQuery(c.countryNameZh) }}
                      style={{
                        width: '100%', background: 'none', border: 'none',
                        borderBottom: i < filtered.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                        padding: '12px 16px', cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                      <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={28} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{c.countryNameZh}</p>
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{c.countryNameEn}</p>
                      </div>
                      {c.minPrice && <span style={{ fontSize: 13, fontWeight: 800, color: C.primary }}>NT${c.minPrice}起</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleSearch} style={{
              background: C.primary,
              border: '2px solid rgba(0,0,0,0.10)',
              borderRadius: 18, flexShrink: 0,
              padding: '0 18px', cursor: 'pointer', color: '#fff', fontWeight: 700, fontSize: 14,
              height: 48, boxShadow: '0 6px 16px rgba(0,0,0,0.10)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
      )}

      {/* ── Hero Banner ── */}
      <div style={{ padding: '18px 20px 0' }}>
        <div style={{
          borderRadius: 28, padding: '28px 22px',
          position: 'relative', overflow: 'hidden', minHeight: 180,
          backgroundImage: 'url(https://images.pexels.com/photos/3042418/pexels-photo-3042418.jpeg?auto=compress&cs=tinysrgb&w=1000)',
          backgroundSize: 'cover', backgroundPosition: 'center 40%',
          boxShadow: `0 14px 30px ${C.primary}30`,
          border: `2px solid ${C.primary}2e`,
        }}>
          {/* 中性深色 scrim：文字側壓暗保可讀、右側讓照片原色透出（不再用品牌色染滿整張圖） */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, rgba(17,20,30,0.60) 0%, rgba(17,20,30,0.30) 48%, rgba(17,20,30,0) 100%)',
            borderRadius: 26,
          }}/>

          <div style={{ position: 'relative', zIndex: 1, maxWidth: '65%' }}>
            <div style={{
              display: 'inline-block', background: 'rgba(255,255,255,0.2)',
              borderRadius: 8, padding: '3px 10px', marginBottom: 10,
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '0.14em', textTransform: 'uppercase' }}>出發前必備</p>
            </div>
            <h2 style={{ fontSize: 27, fontWeight: 900, color: '#fff', margin: '0 0 8px', lineHeight: 1.1, letterSpacing: '-0.025em', textShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>探索世界，<br/>隨時在線</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '0 0 18px', lineHeight: 1.4, textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>最便宜的旅遊 eSIM 方案</p>
            <button onClick={() => onNavigate('products')} style={{
              background: '#fff', border: '2px solid rgba(255,255,255,0.8)', borderRadius: 22,
              padding: '9px 20px', cursor: 'pointer',
              fontSize: 13, fontWeight: 800, color: C.primary,
              boxShadow: '0 6px 16px rgba(0,0,0,0.14)',
            }}>
              立即選購 →
            </button>
          </div>
        </div>
      </div>

      {/* ── 快速功能 ── */}
      <div style={{ padding: '22px 20px 0' }}>
        <p style={{ fontSize: 19, fontWeight: 900, color: '#1a1a1a', margin: '0 0 14px', letterSpacing: '-0.025em' }}>快速功能</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {QUICK_ACTIONS.map(({ key, label, Icon, iconShade }, i) => (
            <button key={key} onClick={() => onNavigate(key)}
              style={{
                background: '#fff', borderRadius: 22,
                border: '1px solid #ECEEF3',
                padding: '17px 4px 14px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10, cursor: 'pointer',
                animation: `fadeUp 0.4s ${i * 0.05}s ease both`,
                boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 5px 14px rgba(16,24,40,0.05)',
              }}>
              <div style={{
                width: 46, height: 46, borderRadius: 16,
                background: '#F1F3F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon color={`${C.primary}${iconShade}`} size={23} />
              </div>
              <span style={{ fontSize: 11.5, color: '#475467', fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 熱門目的地（票券式精緻卡片） ── */}
      <div style={{ padding: '28px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 4, height: 18, borderRadius: 3,
              background: `linear-gradient(180deg, ${C.primary}, ${C.primary}80)`,
            }} />
            <p style={{ fontSize: 19, fontWeight: 900, color: '#1a1a1a', margin: 0, letterSpacing: '-0.025em' }}>熱門目的地</p>
          </div>
          <button onClick={() => onNavigate('products')} style={{
            background: `${C.primary}14`, border: 'none', cursor: 'pointer',
            fontSize: 12, color: C.primary, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '6px 12px', borderRadius: 100,
          }}>
            查看全部
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {hot.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 14 }}>暫無商品</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {hot.map((c, i) => {
              const { accent } = getAccent(c.countryCode)
              const img = resolveDestImage(c.countryCode, c.countryNameZh)
              const isHot = i < 2
              return (
                <button key={c.countryCode} onClick={() => onSelectCountry(c.countryCode)}
                  className="ch-dest-card"
                  style={{
                    position: 'relative', borderRadius: 20, overflow: 'hidden',
                    border: 'none', cursor: 'pointer',
                    padding: 0, textAlign: 'left', minHeight: 172, display: 'block',
                    animation: `fadeUp 0.4s ${0.1 + i * 0.04}s ease both`,
                    boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 12px 26px rgba(15,23,42,0.12)',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                    transition: 'transform 0.12s ease, box-shadow 0.18s ease',
                  }}>
                  {/* 底圖：各國實景照片；缺圖時退回目的地色漸層，載入中先顯示 accent 底色，不破圖 */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundColor: accent,
                    backgroundImage: img ? `url(${img})` : `linear-gradient(155deg, ${accent}, ${accent}cc)`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                  }} />
                  {/* 底部深色 scrim：讓白字在照片上可讀 */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 32%, rgba(0,0,0,0.62) 100%)',
                  }} />

                  {/* 國旗小圓章（左上） */}
                  <div style={{
                    position: 'absolute', top: 12, left: 12,
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.92)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  }}>
                    <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={22} />
                  </div>

                  {/* HOT badge（右上） */}
                  {isHot && (
                    <div style={{
                      position: 'absolute', top: 13, right: 12,
                      background: 'rgba(255,255,255,0.92)', borderRadius: 100,
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                      color: '#111827', padding: '3px 9px',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, display: 'inline-block' }} />
                      HOT
                    </div>
                  )}

                  {/* 國名 + 價格（左下白字） */}
                  <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: '0 0 1px', letterSpacing: '-0.02em', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{c.countryNameZh}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.82)', margin: '0 0 7px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>{c.countryNameEn}</p>
                      {c.minPrice ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>NT$</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{c.minPrice}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>起</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>立即選購 →</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dropIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .ch-dest-card:active { transform: scale(0.97); box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
      `}</style>
    </div>
  )
}
