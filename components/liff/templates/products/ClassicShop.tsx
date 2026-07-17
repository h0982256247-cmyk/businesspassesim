'use client'

import { useMemo, useState } from 'react'
import { calcBestPrice } from '@/lib/utils/coupon-combo'
import { CountryFlag } from '@/components/common/CountryFlag'
import { getCoverageList, CoveragePopup } from '@/components/liff/CoverageCountries'
import DayPicker from '@/components/liff/DayPicker'
import { annotatePlans, sortByValue, TIER_COLOR } from '@/lib/utils/product-display'
import { NetworkBadge, NativeSimBadge } from '@/components/liff/ProductBadges'
import { resolveDestImage } from '@/lib/utils/dest-image'
import type { ProductsTemplateProps } from './types'

const S = {
  bg: '#EEEEF8', white: '#ffffff', ink: '#0f172a',
  muted: '#475569', faint: '#94a3b8', line: 'rgba(15,23,42,0.06)',
  softCard: 'rgba(255,255,255,0.65)',
} as const

// 旅遊風統一色系：與主頁 ClassicHome 共用配色邏輯
const DEST_PALETTE = [
  { accent: '#5B6CF0', soft: '#EEF0FE' },
  { accent: '#0EA5B5', soft: '#E6F5F7' },
  { accent: '#E0930E', soft: '#FBF2DE' },
  { accent: '#14A06B', soft: '#E7F5EE' },
  { accent: '#EC6A5E', soft: '#FCEDEB' },
  { accent: '#B66BC4', soft: '#F6ECF8' },
]
function getAccent(code: string) {
  let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff
  return DEST_PALETTE[Math.abs(h) % DEST_PALETTE.length]
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function CartPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.2" fill="currentColor" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" />
      <path d="M2.5 3h2.6l2.4 12.1a2 2 0 0 0 2 1.6h9.3a2 2 0 0 0 2-1.55L22.5 7H6.3" />
      <line x1="14" y1="9" x2="14" y2="13" />
      <line x1="12" y1="11" x2="16" y2="11" />
    </svg>
  )
}

function CartCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CrownIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 18l-2-11 6 4 5-8 5 8 6-4-2 11H3zm0 2h18v2H3v-2z" />
    </svg>
  )
}

export default function ClassicShop({
  countries, products, coverageCountries, coupons, selectedCountry,
  colors: C, onSelectCountry, onSelectProduct, onBack,
  filter, cart,
}: ProductsTemplateProps) {
  // Hooks 一律在任何 early return 之前呼叫（react-hooks/rules-of-hooks）
  const displays = useMemo(() => sortByValue(annotatePlans(products)), [products])
  // 適用國家（匯入 L 欄）：用整組（未經日篩）的字串，共用解析 + 彈窗
  const [showCoverage, setShowCoverage] = useState(false)
  const coverageList = useMemo(() => getCoverageList(coverageCountries), [coverageCountries])

  // Country selection screen — 機票/登機證主視覺
  if (!selectedCountry) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 96, background: S.bg, minHeight: '100vh' }}>
        {/* Hero：登機證式紫色漸層 banner，呼應主頁 hero 風格 */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: 24, padding: '24px 22px 26px',
            background: 'linear-gradient(135deg, #6D28D9 0%, #7C3AED 55%, #A78BFA 100%)',
            boxShadow: '0 12px 28px rgba(109,40,217,0.25)',
            border: '1px solid rgba(109,40,217,0.2)',
          }}>
            {/* 裝飾性世界地圖點點 */}
            <svg width="220" height="160" viewBox="0 0 220 160" style={{ position: 'absolute', right: -28, top: -10, opacity: 0.18 }}>
              <g fill="#fff">
                {Array.from({ length: 70 }).map((_, idx) => {
                  const cx = (idx * 37) % 220
                  const cy = (idx * 53) % 160
                  const r = ((idx * 7) % 3) + 1
                  return <circle key={idx} cx={cx} cy={cy} r={r} />
                })}
              </g>
            </svg>

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.28)',
                borderRadius: 100, padding: '4px 12px', marginBottom: 12,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
                  <path d="M2.5 19l19-8L2.5 3v6l13 2-13 2v6z" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.14em', textTransform: 'uppercase' }}>準備出發</span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.025em', lineHeight: 1.15, textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                選擇你的目的地
              </h1>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.86)', margin: '6px 0 0', letterSpacing: '0.02em' }}>
                {countries.length > 0 ? `${countries.length} 個熱門國家 · 即買即用 eSIM` : '購買出國 eSIM · 即插即用'}
              </p>
            </div>
          </div>
        </div>

        {/* 區段標題 */}
        <div style={{ padding: '24px 20px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', width: 4, height: 18, borderRadius: 3,
            background: 'linear-gradient(180deg, #7C3AED, #C4B5FD)',
          }} />
          <p style={{ fontSize: 16, fontWeight: 900, color: S.ink, margin: 0, letterSpacing: '-0.02em' }}>所有目的地</p>
          {countries.length > 0 && (
            <span style={{ fontSize: 11, color: S.faint, fontWeight: 600, marginLeft: 'auto' }}>
              共 {countries.length} 國
            </span>
          )}
        </div>

        {countries.length === 0 ? (
          <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>目前沒有可購買的商品</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px' }}>
            {countries.map((c) => {
              const { accent } = getAccent(c.countryCode)
              const img = resolveDestImage(c.countryCode, c.countryNameZh)
              return (
                <button
                  key={c.countryCode}
                  onClick={() => onSelectCountry(c.countryCode)}
                  className="cs-country-card"
                  style={{
                    position: 'relative', overflow: 'hidden',
                    border: 'none', borderRadius: 20, padding: 0,
                    textAlign: 'left', cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 12px 26px rgba(15,23,42,0.12)',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                    transition: 'transform 0.12s ease, box-shadow 0.18s ease',
                    minHeight: 168,
                    display: 'block',
                  }}
                >
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
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 34%, rgba(0,0,0,0.64) 100%)',
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

                  {/* 國名 + 查看方案（左下白字） */}
                  <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: '0 0 1px', letterSpacing: '-0.02em', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{c.countryNameZh}</p>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.82)', margin: '0 0 7px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>{c.countryNameEn}</p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 100, backdropFilter: 'blur(2px)' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.02em' }}>查看方案</span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <style>{`
          .cs-country-card:active { transform: scale(0.97); box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
        `}</style>
      </div>
    )
  }

  const country = countries.find(c => c.countryCode === selectedCountry)
  const showNoMatch = filter.dayFilter > 0 && filter.filteredCount === 0
  const countryAccent = country ? getAccent(country.countryCode) : DEST_PALETTE[0]

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 96, background: S.bg, minHeight: '100vh' }}>
      {/* Sticky header（更精緻的 glass header + 國家色條） */}
      <div style={{
        position: 'sticky', top: 0,
        background: 'rgba(238,238,248,0.92)', backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 10,
        borderBottom: `1px solid ${S.line}`,
      }}>
        {/* 國家識別色條 */}
        <div style={{
          height: 3, width: '100%',
          background: `linear-gradient(90deg, ${countryAccent.accent}, ${countryAccent.accent}66)`,
        }} />
        <div style={{ padding: '12px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} aria-label="返回"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#fff', border: '1px solid rgba(15,23,42,0.06)',
              padding: 0, cursor: 'pointer', color: S.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
            <BackArrow />
          </button>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {country && (
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: countryAccent.soft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `inset 0 0 0 1.5px ${countryAccent.accent}26`,
                flexShrink: 0,
              }}>
                <CountryFlag code={country.countryCode} fallbackEmoji={country.countryFlag} size={24} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 16, fontWeight: 900, color: S.ink, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {country?.countryNameZh ?? '方案'}
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* 國家識別 hero：一眼確認「現在看的是哪國方案」 */}
      {country && (
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: 20, padding: '18px 20px',
            background: `linear-gradient(135deg, ${countryAccent.accent} 0%, ${countryAccent.accent}cc 60%, ${countryAccent.accent}99 100%)`,
            boxShadow: `0 10px 24px ${countryAccent.accent}33`,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <svg width="180" height="120" viewBox="0 0 180 120" style={{ position: 'absolute', right: -20, top: -8, opacity: 0.16 }}>
              <g fill="#fff">
                {Array.from({ length: 48 }).map((_, idx) => (
                  <circle key={idx} cx={(idx * 41) % 180} cy={(idx * 57) % 120} r={((idx * 5) % 3) + 1} />
                ))}
              </g>
            </svg>
            {coverageList.length > 0 && (
              <button
                onClick={() => setShowCoverage(true)}
                style={{
                  position: 'absolute', top: 14, right: 14, zIndex: 2,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'rgba(255,255,255,0.95)', color: countryAccent.accent,
                  border: 'none', borderRadius: 100, padding: '7px 13px',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.18)', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
                適用國家
              </button>
            )}
            <div style={{
              width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.16)',
              position: 'relative', zIndex: 1,
            }}>
              <CountryFlag code={country.countryCode} fallbackEmoji={country.countryFlag} size={40} />
            </div>
            <div style={{ position: 'relative', zIndex: 1, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.025em', textShadow: '0 1px 3px rgba(0,0,0,0.18)' }}>
                  {country.countryNameZh}
                </h2>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {country.countryNameEn}
                </span>
              </div>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.92)', margin: '5px 0 0', fontWeight: 600, letterSpacing: '0.02em' }}>
                {filter.totalCount > 0 ? `${filter.totalCount} 個 eSIM 方案 · 即買即用` : '即插即用 eSIM'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Day picker */}
      {filter.availableDays.length > 0 && (
        <div style={{ padding: '16px 16px 4px' }}>
          <DayPicker
            value={filter.pickerDays}
            onChange={filter.onChange}
            min={filter.minDay}
            max={filter.maxDay}
            presets={filter.presets}
            label="想用幾天？"
            caption={filter.dayFilter
              ? (filter.filteredCount > 0 ? `找到 ${filter.filteredCount} 個 ${filter.dayFilter} 天方案` : `沒有 ${filter.dayFilter} 天的方案`)
              : '點 +/− 或輸入即可篩選'}
          />
        </div>
      )}

      {/* 流量類型：總量 / 每日型 / 吃到飽（置中，對應主頁搜尋；不選＝全部，再點一下取消）*/}
      {filter.availableDays.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '6px 16px 0', flexWrap: 'wrap' }}>
          {filter.dataOptions.map(opt => {
            const active = filter.dataType === opt
            return (
              <button
                key={opt}
                onClick={() => filter.onDataType(active ? null : opt)}
                style={{
                  padding: '7px 16px', borderRadius: 100, cursor: 'pointer',
                  border: active ? `1.5px solid ${C.primary}` : '1.5px solid rgba(15,23,42,0.10)',
                  background: active ? C.primary : '#fff',
                  color: active ? C.onPrimary : S.muted,
                  fontSize: 13, fontWeight: 700,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'background 0.15s, border 0.15s, color 0.15s',
                }}
              >{opt}</button>
            )
          })}
        </div>
      )}

      {/* Plans */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filter.totalCount === 0 && (
          <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>此目的地暫無可購買方案</p>
        )}

        {showNoMatch && filter.nearestDays.length > 0 && (
          <div style={{ padding: '8px 4px' }}>
            <p style={{ fontSize: 13, color: S.muted, margin: '0 0 8px' }}>您也可以選擇相近天數：</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {filter.nearestDays.map(n => (
                <button
                  key={n}
                  onClick={() => filter.onChange(n)}
                  style={{
                    padding: '7px 14px', borderRadius: 100,
                    border: `1px solid ${C.border}`, background: C.light, color: C.primary,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >{n} 天</button>
              ))}
            </div>
          </div>
        )}

        {displays.map(d => {
          const p = d.plan
          const { bestPrice, hasDiscount } = calcBestPrice(coupons, p.sellPrice)
          const inCart = cart.has(p.id)
          const tier = TIER_COLOR[d.tier]
          return (
            <div
              key={p.id}
              style={{
                position: 'relative',
                width: '100%', background: S.white, borderRadius: 18,
                border: `1px solid ${inCart ? `${C.primary}59` : 'rgba(15,23,42,0.07)'}`,
                boxShadow: inCart
                  ? `0 0 0 2px ${C.primary}22, 0 8px 20px ${C.primary}14`
                  : '0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)',
                transition: 'box-shadow 0.2s, border 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'stretch', padding: 12, gap: 10 }}>
                {/* 左側可點 → 進入詳情 */}
                <button
                  type="button"
                  onClick={() => onSelectProduct(p.id)}
                  className="cs-plan-tap"
                  style={{
                    flex: 1, background: 'transparent', border: 'none',
                    padding: 0, margin: 0,
                    cursor: 'pointer', textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                    display: 'flex', alignItems: 'center', gap: 10,
                    minWidth: 0, borderRadius: 12,
                  }}
                >
                  {/* Day badge */}
                  <div style={{
                    width: 46, height: 46, borderRadius: 13, flexShrink: 0,
                    background: tier.bg, color: tier.fg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `inset 0 0 0 1.5px ${tier.accent}1a`,
                  }}>
                    <span style={{ fontSize: 19, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em' }}>{p.displayDays}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, marginTop: 1, letterSpacing: '0.1em' }}>天</span>
                  </div>

                  {/* Info：流量直接顯示完整字串（總量5GB / 1GB/天 / 無限吃到飽 / 鈦金吃到飽）*/}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {p.dataCapacity && (
                      <p style={{ fontSize: 16, fontWeight: 900, color: S.ink, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
                        {p.dataCapacity}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                      <NetworkBadge networkType={p.networkType} />
                      <NativeSimBadge isNative={p.isNativeSim} />
                    </div>
                    {p.description && (
                      <p style={{
                        fontSize: 11, color: S.muted, margin: '4px 0 0', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.description}
                      </p>
                    )}
                  </div>
                </button>

                {/* 右側：價格 + 加入按鈕（乾淨卡片，非票根樣式） */}
                <div style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-end', justifyContent: 'center', gap: 8,
                  paddingLeft: 12, borderLeft: '1px solid rgba(15,23,42,0.07)',
                }}>
                  <div style={{ textAlign: 'right' }}>
                    {d.recommended && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
                        fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 100,
                        letterSpacing: '0.06em', marginBottom: 4,
                        boxShadow: '0 2px 6px rgba(217,119,6,0.28)',
                      }}>
                        <CrownIcon size={9} /> 最划算
                      </span>
                    )}
                    {hasDiscount && (
                      <p style={{ fontSize: 11, color: S.faint, margin: 0, textDecoration: 'line-through' }}>
                        NT${p.sellPrice.toLocaleString()}
                      </p>
                    )}
                    <p style={{ fontSize: 22, fontWeight: 900, color: C.primary, margin: 0, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>NT$</span>{bestPrice.toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); cart.toggle(p) }}
                    aria-label={inCart ? '從購物車移除' : '加入購物車'}
                    className="cs-cart-tap"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '8px 14px', borderRadius: 100,
                      background: inCart ? C.primary : `${C.primary}10`,
                      color: inCart ? C.onPrimary : C.primary,
                      border: inCart ? 'none' : `1.5px solid ${C.primary}33`,
                      cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
                      transition: 'background 0.18s, color 0.18s',
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                    }}
                  >
                    {inCart ? <CartCheckIcon /> : <CartPlusIcon />}
                    {inCart ? '已加入' : '加入'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .cs-plan-tap:active { background: rgba(15,23,42,0.04); }
        .cs-cart-tap:active { filter: brightness(0.92); }
      `}</style>

      {/* 適用國家彈窗（共用元件）*/}
      <CoveragePopup open={showCoverage} onClose={() => setShowCoverage(false)} list={coverageList} accentColor={countryAccent.accent} />
    </div>
  )
}
