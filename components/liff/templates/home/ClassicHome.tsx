'use client'

import { useState } from 'react'
import Image from 'next/image'
import { BeeLogoSVG } from '@/components/liff/LiffIllustrations'
import { IconMyEsim, IconGuide, IconSupport, IconDevices } from './HomeIcons'
import FilterDropdown from './FilterDropdown'
import { CountryFlag } from '@/components/common/CountryFlag'
import { resolveDestImage, DEFAULT_HOME_HERO_URL } from '@/lib/utils/dest-image'
import { APPEARANCE } from '@/lib/utils/appearance'
import { filterCountriesByQuery } from '@/lib/utils/country-search'
import type { HomePageProps } from './types'

const QUICK_ACTIONS = [
  // 通透版：無卡框，duotone 圖示坐在品牌淡底圓角上；主色動態帶入、不寫死品牌色。
  { key: 'orders',  label: '我的 eSIM', Icon: IconMyEsim },
  { key: 'guide',   label: '安裝教學',  Icon: IconGuide },
  { key: 'support', label: '客服中心',  Icon: IconSupport },
  { key: 'devices', label: '支援裝置',  Icon: IconDevices },
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
  tenant, countries, coverage, colors: C, onSelectCountry, onNavigate, onSearch,
}: HomePageProps) {
  const [query, setQuery]       = useState('')
  const [selDays, setSelDays]   = useState<string | null>(null)
  const [selData, setSelData]   = useState<string | null>(null)
  // 點下拉選到的國家先「記住」而不是直接跳頁，讓使用者接著選天數/流量再按搜尋
  const [selCountry, setSelCountry] = useState<{ code: string; name: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(true)   // 預設展開搜尋面板
  const brandName = tenant?.brandName ?? 'eSIM'

  // 與商城搜尋同一套規則（filterCountriesByQuery 單一來源）：國名（中/英）＋適用國家
  // 聯集，「打日出日本」、打香港連中港澳一起出現。coverage 尚未回來時退化成純國名比對。
  const filtered = query.trim()
    ? filterCountriesByQuery(countries, query, coverage)
    : []
  // 熱門目的地：取商城排序（業主指定順序，見 lib/utils/country-order）的前 6 個。
  const hot = countries.slice(0, 6)

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
              // unoptimized：logo 是後台上傳的遠端 URL（host 不固定，無法列 remotePatterns），46px 小圖不走優化器
              ? <Image src={tenant.logoUrl} alt={brandName} width={46} height={46} unoptimized style={{ width: 46, height: 46, objectFit: 'cover' }} />
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
          borderRadius: 28,
          position: 'relative', overflow: 'hidden',
          aspectRatio: String(APPEARANCE.home.ratio), boxSizing: 'border-box',
          backgroundImage: `url(${tenant?.homeHeroUrl || DEFAULT_HOME_HERO_URL})`,
          backgroundSize: 'cover', backgroundPosition: 'center 40%',
          boxShadow: `0 14px 30px ${C.primary}30`,
          border: `2px solid ${C.primary}2e`,
        }}>
          {/* 左側壓暗 scrim：右側讓照片透出、左側保白字可讀 */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(100deg, rgba(15,18,28,0.68) 0%, rgba(15,18,28,0.34) 52%, rgba(15,18,28,0) 100%)',
          }}/>

          {/* 內容絕對填滿、垂直置中；字級用 clamp 隨版位寬度縮放，確保 16:9 內不裁到、又清晰 */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
            padding: 'clamp(16px, 5vw, 26px)', maxWidth: '72%',
          }}>
            <div style={{
              display: 'inline-block', background: 'rgba(255,255,255,0.2)',
              borderRadius: 8, padding: '2px 9px', marginBottom: 'clamp(5px, 1.6vw, 10px)',
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              <p style={{ fontSize: 'clamp(8px, 2.5vw, 11px)', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '0.14em', textTransform: 'uppercase' }}>出發前必備</p>
            </div>
            <h2 style={{ fontSize: 'clamp(19px, 6vw, 28px)', fontWeight: 900, color: '#fff', margin: '0 0 clamp(4px, 1.4vw, 8px)', lineHeight: 1.12, letterSpacing: '-0.025em', textShadow: '0 2px 10px rgba(0,0,0,0.35)' }}>探索世界，<br/>隨時在線</h2>
            <p style={{ fontSize: 'clamp(11px, 3vw, 14px)', color: 'rgba(255,255,255,0.9)', margin: '0 0 clamp(8px, 2.6vw, 16px)', lineHeight: 1.35, textShadow: '0 1px 5px rgba(0,0,0,0.3)' }}>最便宜的旅遊 eSIM 方案</p>
            <button onClick={() => onNavigate('products')} style={{
              background: '#fff', border: '2px solid rgba(255,255,255,0.85)', borderRadius: 22,
              padding: 'clamp(7px, 2vw, 10px) clamp(16px, 4.5vw, 22px)', cursor: 'pointer',
              fontSize: 'clamp(12px, 3.3vw, 14px)', fontWeight: 800, color: C.primary,
              boxShadow: '0 6px 16px rgba(0,0,0,0.16)', whiteSpace: 'nowrap',
            }}>
              立即選購 →
            </button>
          </div>
        </div>
      </div>

      {/* ── 快速功能 ── */}
      <div style={{ padding: '22px 20px 0' }}>
        <p style={{ fontSize: 19, fontWeight: 900, color: '#1a1a1a', margin: '0 0 14px', letterSpacing: '-0.025em' }}>快速功能</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {QUICK_ACTIONS.map(({ key, label, Icon }, i) => (
            <button key={key} onClick={() => onNavigate(key)}
              className="liff-press"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 0', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 11,
                animation: `fadeUp 0.4s ${i * 0.05}s ease both`,
              }}>
              <div style={{
                width: 60, height: 60, borderRadius: 20,
                background: C.light,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon color={C.primary} size={27} />
              </div>
              <span style={{ fontSize: 12, color: '#1a1a2e', fontWeight: 600, textAlign: 'center', letterSpacing: '0.01em' }}>{label}</span>
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
              const img = c.imageUrl ?? resolveDestImage(c.countryCode, c.countryNameZh)
              const isHot = i < 2
              return (
                <button key={c.countryCode} onClick={() => onSelectCountry(c.countryCode)}
                  className="ch-dest-card"
                  style={{
                    position: 'relative', borderRadius: 20, overflow: 'hidden',
                    border: 'none', cursor: 'pointer',
                    padding: 0, textAlign: 'left', aspectRatio: String(APPEARANCE.dest.ratio), display: 'block',
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
                    <p style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 1px', letterSpacing: '-0.02em', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{c.countryNameZh}</p>
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

        {/* 底部全寬「查看全部」：滑完 6 張卡剛好是想看更多的時刻，右上角那顆此時已捲出畫面。
            刻意無底框無邊框——直接浮在頁面底色上，讓上方的目的地卡是唯一的「卡片」；
            紙飛機沿虛線航線起飛 + 文字輕輕浮動，整塊都可點。動效慢而小幅度
            （列表頁不該有搶戲的動畫），並尊重 prefers-reduced-motion。
            padding 保留 16px 上下，觸控區才有 48px 高（無框時更需要靠 padding 撐）。 */}
        {hot.length > 0 && (
          <button onClick={() => onNavigate('products')}
            className="ch-viewall"
            style={{
              width: '100%', marginTop: 10,
              background: 'transparent', border: 'none',
              padding: '16px 0', cursor: 'pointer',
              fontSize: 14, fontWeight: 800, color: C.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              animation: 'fadeUp 0.4s 0.35s ease both',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              transition: 'transform 0.12s ease, opacity 0.12s ease',
            }}>
            {/* 航線 + 紙飛機（純裝飾，不進無障礙樹） */}
            <span className="ch-va-scene" aria-hidden="true">
              <svg className="ch-va-trail" width="34" height="18" viewBox="0 0 34 18" fill="none">
                <path d="M1 15 Q10 15 17 9.5 T31 4" stroke={C.primary} strokeOpacity="0.35"
                  strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.5 3.5" />
              </svg>
              <span className="ch-va-plane">
                <svg width="13" height="13" viewBox="0 0 24 24" fill={C.primary}>
                  <path d="M21.4 2.6a1 1 0 0 0-1.1-.2L3.2 9.9c-.9.4-.8 1.7.1 2l5.6 1.9 2 5.8c.3.9 1.6.9 2-.1l7.7-16.8a1 1 0 0 0-.2-1.1zM10.6 13.9l7.2-7.5-4.4 8.9-1 2.9-1-2.9z"/>
                </svg>
              </span>
            </span>
            <span className="ch-va-text">查看全部目的地</span>
            <svg className="ch-va-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dropIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        .ch-dest-card:active { transform: scale(0.97); box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
        /* 無底框時少了「表面被壓下」的線索，按壓回饋改用縮放＋淡出雙重提示 */
        .ch-viewall:active { transform: scale(0.97); opacity: 0.6; }

        /* 「查看全部目的地」的小動畫。紙飛機沿航線起飛後回到原點循環，
           文字與箭頭各自以不同節奏浮動，看起來像整塊在輕輕呼吸。 */
        .ch-va-scene { position: relative; display: inline-block; width: 34px; height: 18px; flex-shrink: 0; }
        .ch-va-trail { position: absolute; inset: 0; animation: vaTrail 2.4s linear infinite; }
        .ch-va-plane {
          position: absolute; left: 3px; bottom: 1px; display: inline-flex;
          animation: vaFly 2.4s cubic-bezier(0.45,0,0.55,1) infinite;
        }
        .ch-va-text { animation: vaFloat 2.4s ease-in-out infinite; }
        .ch-va-chevron { animation: vaNudge 2.4s ease-in-out infinite; flex-shrink: 0; }

        /* 虛線往前流動，製造「航線延伸」感 */
        @keyframes vaTrail { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -12 } }
        /* 沿著 Q 曲線的方向起飛：右上前進、機頭微抬，末段淡出回到起點 */
        @keyframes vaFly {
          0%   { transform: translate(0,0) rotate(0deg);        opacity: 1 }
          55%  { transform: translate(17px,-9px) rotate(-10deg); opacity: 1 }
          70%  { transform: translate(22px,-12px) rotate(-10deg); opacity: 0 }
          71%  { transform: translate(0,0) rotate(0deg);        opacity: 0 }
          100% { transform: translate(0,0) rotate(0deg);        opacity: 1 }
        }
        @keyframes vaFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
        @keyframes vaNudge { 0%,100% { transform: translateX(0) } 50% { transform: translateX(3px) } }

        /* 使用者關閉動效時一律靜止（含入場的 fadeUp），只留可點擊的按壓回饋 */
        @media (prefers-reduced-motion: reduce) {
          .ch-va-trail, .ch-va-plane, .ch-va-text, .ch-va-chevron, .ch-viewall { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
