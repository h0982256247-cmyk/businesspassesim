'use client'

import { useMemo, useState } from 'react'
import { CountryFlag } from '@/components/common/CountryFlag'
import { getCoverageList, CoveragePopup } from '@/components/liff/CoverageCountries'
import { annotatePlans, sortByValue, TIER_COLOR } from '@/lib/utils/product-display'
import { NetworkBadge, NativeSimBadge } from '@/components/liff/ProductBadges'
import { resolveDestImage } from '@/lib/utils/dest-image'
import { APPEARANCE } from '@/lib/utils/appearance'
import { filterCountriesByQuery } from '@/lib/utils/country-search'
import { useT } from '@/components/liff/LocaleProvider'
import { enCountryName } from '@/lib/liff/country-names'
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

// 篩選下拉（方案 / 天數共用）：原生 select + 自繪箭頭，選中時邊框帶品牌色。
function FilterSelect({ label, value, onChange, options, primary }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  primary: string
}) {
  return (
    <label style={{ flex: 1, minWidth: 0, display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: S.muted, margin: '0 0 5px 2px' }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
            width: '100%', padding: '11px 34px 11px 14px',
            borderRadius: 14, border: `1.5px solid ${value ? primary : 'rgba(15,23,42,0.12)'}`,
            background: '#fff', color: '#1a1a1a', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', outline: 'none',
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </label>
  )
}

export default function ClassicShop({
  countries, products, allProducts, coverageCountries, selectedCountry,
  colors: C, onSelectCountry, onSelectProduct, onBack,
  filter, cart, shopHeroUrl,
}: ProductsTemplateProps) {
  // Hooks 一律在任何 early return 之前呼叫（react-hooks/rules-of-hooks）
  const { t, locale } = useT()
  const cname = (zh: string, en: string) => (locale === 'en' ? enCountryName(zh, en) : zh)
  const displays = useMemo(() => sortByValue(annotatePlans(products)), [products])
  // 適用國家（匯入 L 欄）：用整組（未經日篩）的字串，共用解析 + 彈窗
  const [showCoverage, setShowCoverage] = useState(false)
  const coverageList = useMemo(() => getCoverageList(coverageCountries), [coverageCountries])

  // 底部浮動搜尋列（國家清單畫面）：打字即篩選上方的國家卡格，不跳頁。
  // 比對規則走共用單一來源 filterCountriesByQuery（主頁搜尋同一支）。
  // 掃全量方案（allProducts）：products 已被預設天數篩過，會漏掉沒有該天數方案的目的地。
  const [searchQ, setSearchQ] = useState('')
  const shownCountries = useMemo(
    () => filterCountriesByQuery(countries, searchQ, allProducts ?? products),
    [searchQ, countries, products, allProducts],
  )

  // Country selection screen — 機票/登機證主視覺
  if (!selectedCountry) {
    return (
      // paddingBottom 預留底部導覽 + 浮動搜尋列的高度，避免最後一排卡片被蓋住
      <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 172, background: S.bg, minHeight: '100vh' }}>
        {/* Hero：登機證式紫色漸層 banner，呼應主頁 hero 風格 */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: 24, padding: '24px 22px 26px',
            // 頂圖固定 16:9（與後台建議一致）；文字短、垂直置中，照片好好顯示而非薄薄一條。
            aspectRatio: String(APPEARANCE.shop.ratio), boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            // 有後台上傳頂圖：品牌色漸層(帶透明)疊在照片上，白字仍可讀；沒有則沿用純品牌漸層。
            background: shopHeroUrl
              ? `linear-gradient(135deg, ${C.primaryText}e6 0%, ${C.primary}b3 100%), url(${shopHeroUrl}) center/cover`
              : `linear-gradient(135deg, ${C.primaryText} 0%, ${C.primary} 100%)`,
            boxShadow: `0 12px 28px ${C.border}`,
            border: `1px solid ${C.border}`,
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
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{t.shop.heroEyebrow}</span>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.025em', lineHeight: 1.15, textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                {t.shop.heroTitle}
              </h1>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.86)', margin: '6px 0 0', letterSpacing: '0.02em' }}>
                {countries.length > 0 ? t.shop.heroSubtitle(countries.length) : t.shop.heroSubtitleFallback}
              </p>
            </div>
          </div>
        </div>

        {/* 區段標題 */}
        <div style={{ padding: '24px 20px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', width: 4, height: 18, borderRadius: 3,
            background: `linear-gradient(180deg, ${C.primary}, ${C.soft})`,
          }} />
          <p style={{ fontSize: 16, fontWeight: 900, color: S.ink, margin: 0, letterSpacing: '-0.02em' }}>{t.shop.allDest}</p>
          {countries.length > 0 && (
            <span style={{ fontSize: 11, color: S.faint, fontWeight: 600, marginLeft: 'auto' }}>
              {searchQ.trim() ? t.shop.matchCount(shownCountries.length) : t.shop.totalCount(countries.length)}
            </span>
          )}
        </div>

        {countries.length === 0 ? (
          <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>{t.shop.empty}</p>
        ) : shownCountries.length === 0 ? (
          <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>
            {t.shop.noResult(searchQ.trim())}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px' }}>
            {shownCountries.map((c) => {
              const { accent } = getAccent(c.countryCode)
              const img = c.imageUrl ?? resolveDestImage(c.countryCode, c.countryNameZh)
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
                    aspectRatio: String(APPEARANCE.dest.ratio),
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
                    <p style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 7px', letterSpacing: '-0.02em', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{cname(c.countryNameZh, c.countryNameEn)}</p>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '3px 10px', borderRadius: 100, backdropFilter: 'blur(2px)' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.02em' }}>{t.shop.viewPlans}</span>
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

        {/* ── 底部浮動玻璃搜尋列（懸在底部導覽上方）── */}
        <div style={{
          position: 'fixed', left: 0, right: 0, zIndex: 40,
          bottom: 'calc(78px + env(safe-area-inset-bottom))',
          pointerEvents: 'none',
        }}>
          <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
            <div style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.32)',
              backdropFilter: 'blur(18px) saturate(180%)',
              WebkitBackdropFilter: 'blur(18px) saturate(180%)',
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: 100, padding: '9px 9px 9px 20px',
              boxShadow: '0 8px 28px rgba(15,23,42,0.18)',
            }}>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={t.shop.searchPlaceholder}
                enterKeyHint="search"
                style={{
                  flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                  // 16px 起跳：iOS 對 <16px 的輸入框聚焦時會自動放大整頁，維持畫面一致
                  fontSize: 16, fontWeight: 600, color: S.ink,
                }}
              />
              {/* 放大鏡：純裝飾，不可點 */}
              <div aria-hidden style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: C.primary, color: C.onPrimary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 12px ${C.primary}4d`,
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .cs-country-card:active { transform: scale(0.97); box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
        `}</style>
      </div>
    )
  }

  const country = countries.find(c => c.countryCode === selectedCountry)
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
          <button onClick={onBack} aria-label={t.common.back}
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
                {country ? cname(country.countryNameZh, country.countryNameEn) : t.shop.filterPlan}
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
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.025em', textShadow: '0 1px 3px rgba(0,0,0,0.18)', lineHeight: 1.15 }}>
                {cname(country.countryNameZh, country.countryNameEn)}
              </h2>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.92)', margin: '5px 0 0', fontWeight: 600, letterSpacing: '0.02em' }}>
                {filter.totalCount > 0 ? t.shop.countryPlanCount(filter.totalCount) : t.shop.countryPlanFallback}
              </p>
              {coverageList.length > 0 && (
                <button
                  onClick={() => setShowCoverage(true)}
                  style={{
                    marginTop: 10,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'rgba(255,255,255,0.95)', color: countryAccent.accent,
                    border: 'none', borderRadius: 100, padding: '6px 12px',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 3px 10px rgba(0,0,0,0.18)', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
                  {t.shop.coverage}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 篩選卡：方案（左）＋ 天數（右），兩個下拉互相交叉過濾；有篩選時可一鍵清除回全部 */}
      {filter.totalCount > 0 && (() => {
        const isFiltered = filter.dayFilter !== 0 || filter.dataType !== null
        return (
          <div style={{ padding: '16px 16px 4px' }}>
            <div style={{
              background: '#fff', borderRadius: 18, padding: 14,
              border: '1px solid rgba(15,23,42,0.06)', boxShadow: '0 4px 14px rgba(15,23,42,0.05)',
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <FilterSelect
                  label={t.shop.filterPlan}
                  value={filter.dataType ?? ''}
                  onChange={v => filter.onDataType(v || null)}
                  options={[{ value: '', label: t.shop.allPlans }, ...filter.availableDataTypes.map(dt => ({ value: dt, label: t.shop.dataTypeLabel(dt) }))]}
                  primary={C.primary}
                />
                <FilterSelect
                  label={t.shop.filterDays}
                  value={filter.dayFilter ? String(filter.dayFilter) : ''}
                  onChange={v => filter.onDay(v ? Number(v) : 0)}
                  options={[{ value: '', label: t.shop.allDays }, ...filter.availableDays.map(d => ({ value: String(d), label: t.shop.dayOpt(d) }))]}
                  primary={C.primary}
                />
              </div>
              {isFiltered && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    onClick={filter.onClear}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 12px', borderRadius: 100, cursor: 'pointer',
                      border: `1.5px solid ${C.border}`, background: C.light, color: C.primary,
                      fontSize: 12.5, fontWeight: 700, WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    {t.shop.clearFilter}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Plans */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filter.totalCount === 0 && (
          <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>{t.shop.emptyCountryPlans}</p>
        )}

        {displays.map(d => {
          const p = d.plan
          const hasDiscount = p.benefitPrice != null && p.benefitPrice < p.sellPrice
          const bestPrice = hasDiscount ? p.benefitPrice! : p.sellPrice
          const inCart = cart.has(p.id)
          const tier = TIER_COLOR[d.tier]
          // 卡片只顯示「電信商」那行（流量已是標題、效期等其餘條列略過；完整內容在商品詳情頁）
          const carrier = p.description?.split(/\r?\n/).map(l => l.replace(/^[-\s]+/, '').trim()).find(l => l.startsWith('電信商')) ?? null
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
                    <span style={{ fontSize: 9, fontWeight: 800, marginTop: 1, letterSpacing: '0.1em' }}>{t.shop.dayUnit}</span>
                  </div>

                  {/* Info：流量直接顯示完整字串（總量5GB / 1GB/天 / 無限吃到飽 / 鈦金吃到飽）*/}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {p.dataCapacity && (
                      <p style={{ fontSize: 16, fontWeight: 900, color: S.ink, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
                        {t.formatCapacity(p.dataCapacity)}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                      <NetworkBadge networkType={p.networkType} />
                      <NativeSimBadge isNative={p.isNativeSim} />
                    </div>
                    {carrier && (
                      <p style={{
                        fontSize: 11, color: S.muted, margin: '4px 0 0', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {carrier}
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
                        <CrownIcon size={9} /> {t.shop.bestValue}
                      </span>
                    )}
                    {hasDiscount && (
                      <p style={{ fontSize: 11, color: S.faint, margin: 0, textDecoration: 'line-through' }}>
                        NT${p.sellPrice.toLocaleString()}
                      </p>
                    )}
                    <p style={{ fontSize: 22, fontWeight: 900, color: C.primaryText, margin: 0, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>NT$</span>{bestPrice.toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); cart.toggle(p) }}
                    aria-label={inCart ? t.shop.removeAria : t.shop.addAria}
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
                    {inCart ? t.shop.inCart : t.shop.addToCart}
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
