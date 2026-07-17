'use client'

import { useMemo, useState } from 'react'
import { calcBestPrice } from '@/lib/utils/coupon-combo'
import { CountryFlag } from '@/components/common/CountryFlag'
import { getCoverageList, CoveragePopup } from '@/components/liff/CoverageCountries'
import DayPicker from '@/components/liff/DayPicker'
import { annotatePlans, sortByValue, TIER_LABEL, TIER_COLOR } from '@/lib/utils/product-display'
import { NetworkBadge, NativeSimBadge } from '@/components/liff/ProductBadges'
import type { ProductsTemplateProps } from './types'

const S = {
  ink: '#0b0f17', muted: '#475569', faint: '#94a3b8',
  white: '#ffffff', line: 'rgba(15,23,42,0.07)',
} as const

// Country → fixed gradient (same hash as before)
const COUNTRY_GRADIENTS = [
  ['#5B6CF0', '#8B93F2'], ['#0EA5B5', '#3FC3CE'], ['#E0930E', '#EBB14E'],
  ['#14A06B', '#46BB8C'], ['#EC6A5E', '#F2938A'], ['#B66BC4', '#CB94D5'],
  ['#3E7BD6', '#6FA0E4'], ['#D9737E', '#E59AA2'],
]

function gradientPair(code: string) {
  let hash = 0
  for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return COUNTRY_GRADIENTS[Math.abs(hash) % COUNTRY_GRADIENTS.length]
}
function getGradient(code: string) {
  const [a, b] = gradientPair(code)
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`
}
// 取目的地漸層的主色，給適用國家彈窗標題列用（與 hero 同色系）
function getAccentColor(code: string) {
  return gradientPair(code)[0]
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CrownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 18l-2-11 6 4 5-8 5 8 6-4-2 11H3zm0 2h18v2H3v-2z" />
    </svg>
  )
}

export default function MagazineShop({
  countries, products, coverageCountries, coupons, selectedCountry,
  colors: C, onSelectCountry, onSelectProduct, onBack,
  filter, cart,
}: ProductsTemplateProps) {
  // Hooks 一律在任何 early return 之前呼叫（react-hooks/rules-of-hooks）
  const displays = useMemo(() => sortByValue(annotatePlans(products)), [products])
  const [showCoverage, setShowCoverage] = useState(false)
  const coverageList = useMemo(() => getCoverageList(coverageCountries), [coverageCountries])

  if (!selectedCountry) {
    return (
      <div style={{ paddingBottom: 96, background: '#fafafa', minHeight: '100vh' }}>
        <div style={{ padding: '32px 20px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: S.muted, letterSpacing: '0.18em', margin: '0 0 6px', textTransform: 'uppercase' }}>Explore</p>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: S.ink, letterSpacing: '-0.03em', margin: '0 0 6px', lineHeight: 1.05 }}>
            去哪裡？
          </h1>
          <p style={{ fontSize: 14, color: S.muted, margin: 0 }}>選一個目的地開始你的旅程</p>
        </div>

        {/* Featured carousel */}
        <div style={{
          display: 'flex', gap: 14,
          overflowX: 'auto', padding: '0 20px 12px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          {countries.slice(0, 8).map(c => (
            <button
              key={c.countryCode}
              onClick={() => onSelectCountry(c.countryCode)}
              style={{
                flexShrink: 0, width: 168, height: 212,
                borderRadius: 22, border: 'none', cursor: 'pointer',
                background: getGradient(c.countryCode),
                scrollSnapAlign: 'start',
                display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', justifyContent: 'flex-end',
                padding: 20, boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
                position: 'relative', overflow: 'hidden',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ position: 'absolute', top: 18, right: 18, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))' }}>
                <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={52} />
              </div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: 19, fontWeight: 900, color: '#fff', margin: '0 0 2px', textShadow: '0 1px 4px rgba(0,0,0,0.3)', letterSpacing: '-0.01em' }}>
                  {c.countryNameZh}
                </p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.78)', margin: 0, letterSpacing: '0.12em', fontWeight: 600 }}>
                  {c.countryNameEn.toUpperCase()}
                </p>
              </div>
            </button>
          ))}
        </div>

        {countries.length > 0 && (
          <div style={{ padding: '24px 20px 0' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: S.faint, letterSpacing: '0.18em', margin: '0 0 14px' }}>ALL DESTINATIONS</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {countries.map((c, i) => (
                <button
                  key={c.countryCode}
                  onClick={() => onSelectCountry(c.countryCode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: 'none', border: 'none', padding: '14px 4px',
                    cursor: 'pointer', textAlign: 'left',
                    borderBottom: i < countries.length - 1 ? `1px solid ${S.line}` : 'none',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ width: 32, display: 'inline-flex', justifyContent: 'center' }}>
                    <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={28} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: 0, letterSpacing: '-0.01em' }}>{c.countryNameZh}</p>
                    <p style={{ fontSize: 11, color: S.faint, margin: 0, letterSpacing: '0.08em' }}>{c.countryNameEn.toUpperCase()}</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={S.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const country = countries.find(c => c.countryCode === selectedCountry)
  const gradient = getGradient(selectedCountry)
  const showNoMatch = filter.dayFilter > 0 && filter.filteredCount === 0
  const featured = displays.find(d => d.recommended)
  const rest = displays.filter(d => d !== featured)

  return (
    <div style={{ paddingBottom: 96, background: '#fafafa', minHeight: '100vh' }}>
      {/* Hero banner */}
      <div style={{
        background: gradient,
        padding: '0 20px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
        paddingBottom: 40,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none',
              borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
              color: '#fff', display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 13, fontWeight: 600,
              WebkitTapHighlightColor: 'transparent',
              backdropFilter: 'blur(8px)',
            }}
          >
            <BackArrow />
            <span>返回</span>
          </button>
          {coverageList.length > 0 && (
            <button
              onClick={() => setShowCoverage(true)}
              style={{
                background: 'rgba(255,255,255,0.2)', border: 'none',
                borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                color: '#fff', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 13, fontWeight: 600,
                WebkitTapHighlightColor: 'transparent',
                backdropFilter: 'blur(8px)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
              <span>適用國家</span>
            </button>
          )}
        </div>

        {country && (
          <div style={{ marginBottom: 14, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.32))' }}>
            <CountryFlag code={country.countryCode} fallbackEmoji={country.countryFlag} size={80} />
          </div>
        )}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: '0 0 4px', letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
          {country?.countryNameEn ?? 'Destination'}
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.025em', textShadow: '0 2px 10px rgba(0,0,0,0.22)', lineHeight: 1 }}>
          {country?.countryNameZh}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.88)', margin: 0, fontWeight: 500 }}>
          {filter.dayFilter
            ? `已篩選 ${filter.filteredCount} / ${filter.totalCount} 個方案`
            : `${filter.totalCount} 個方案`}
        </p>
      </div>

      {/* DayPicker overlapping hero */}
      {filter.availableDays.length > 0 && (
        <div style={{ padding: '0 16px', marginTop: -22 }}>
          <DayPicker
            value={filter.pickerDays}
            onChange={filter.onChange}
            min={filter.minDay}
            max={filter.maxDay}
            presets={filter.presets}
            label="想用幾天？"
            caption={filter.dayFilter
              ? (filter.filteredCount > 0 ? `找到 ${filter.filteredCount} 個方案` : `沒有 ${filter.dayFilter} 天的方案`)
              : '選擇天數即可篩選方案'}
          />
          {filter.dayFilter > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
              <button
                type="button"
                onClick={filter.onClear}
                style={{
                  background: 'transparent', border: `1px solid ${S.line}`, color: S.muted,
                  fontSize: 12, fontWeight: 600, padding: '6px 14px',
                  borderRadius: 100, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >顯示全部</button>
            </div>
          )}
        </div>
      )}

      {/* 流量類型：總量 / 每日型 / 吃到飽（對應主頁搜尋；不選＝全部，再點一下取消）*/}
      {filter.availableDays.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '14px 16px 0', flexWrap: 'wrap' }}>
          {filter.dataOptions.map(opt => {
            const active = filter.dataType === opt
            return (
              <button
                key={opt}
                onClick={() => filter.onDataType(active ? null : opt)}
                style={{
                  padding: '7px 16px', borderRadius: 100, cursor: 'pointer',
                  border: active ? `1.5px solid ${C.primary}` : `1.5px solid ${S.line}`,
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

      {/* 選的天數沒有方案時，提示相近天數（對齊 ClassicShop）*/}
      {showNoMatch && filter.nearestDays.length > 0 && (
        <div style={{ padding: '16px' }}>
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

      {/* Featured "best value" card */}
      {featured && (
        <div style={{ padding: '20px 16px 8px' }}>
          <p style={{
            fontSize: 11, fontWeight: 800, color: '#a16207',
            letterSpacing: '0.18em', margin: '0 0 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <CrownIcon size={14} /> EDITOR&apos;S PICK
          </p>
          <FeaturedCard
            display={featured}
            coupons={coupons}
            colors={C}
            inCart={cart.has(featured.plan.id)}
            onToggleCart={() => cart.toggle(featured.plan)}
            onSelectProduct={() => onSelectProduct(featured.plan.id)}
          />
        </div>
      )}

      {/* Rest of plans */}
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

        {rest.length > 0 && featured && (
          <p style={{
            fontSize: 11, fontWeight: 800, color: S.faint,
            letterSpacing: '0.18em', margin: '8px 4px 0',
          }}>OTHER PLANS</p>
        )}

        {rest.map(d => {
          const p = d.plan
          const { bestPrice, savedAmount, hasDiscount } = calcBestPrice(coupons, p.sellPrice)
          const inCart = cart.has(p.id)
          const tier = TIER_COLOR[d.tier]
          return (
            <div
              key={p.id}
              style={{
                width: '100%',
                background: S.white, borderRadius: 18,
                boxShadow: inCart
                  ? `0 6px 22px rgba(0,0,0,0.06), 0 0 0 1.5px ${C.primary}`
                  : '0 2px 16px rgba(15,23,42,0.06)',
                display: 'grid', gridTemplateColumns: '1fr auto',
                padding: '18px', gap: 12,
                position: 'relative',
                transition: 'box-shadow 0.18s',
                overflow: 'hidden',
              }}
            >
              {/* Tier color accent corner */}
              <div style={{
                position: 'absolute', top: 0, right: 0,
                width: 80, height: 80,
                background: `radial-gradient(circle at top right, ${tier.accent}22, transparent 70%)`,
                pointerEvents: 'none',
              }} />

              <button
                onClick={() => onSelectProduct(p.id)}
                style={{
                  background: 'transparent', border: 'none', textAlign: 'left',
                  cursor: 'pointer', padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative', zIndex: 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: tier.accent,
                    background: tier.bg, borderRadius: 6, padding: '3px 8px',
                    letterSpacing: '0.06em',
                  }}>{TIER_LABEL[d.tier]}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: S.ink, letterSpacing: '-0.045em', lineHeight: 1 }}>{p.displayDays}</span>
                  <span style={{ fontSize: 14, color: S.muted, fontWeight: 600 }}>天</span>
                </div>
                {p.dataCapacity && (
                  <p style={{ fontSize: 13, fontWeight: 700, color: S.ink, margin: 0, letterSpacing: '-0.01em' }}>
                    {p.dataCapacity}
                  </p>
                )}
                {(p.networkType || p.isNativeSim) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                    <NetworkBadge networkType={p.networkType} />
                    <NativeSimBadge isNative={p.isNativeSim} />
                  </div>
                )}
                {d.totalGB > 0 && !d.isUnlimited && d.isPerDay && (
                  <p style={{ fontSize: 11, color: S.muted, margin: '6px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    共 {Math.round(d.totalGB)} GB
                  </p>
                )}
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, position: 'relative', zIndex: 1 }}>
                <div style={{ textAlign: 'right' }}>
                  {hasDiscount && (
                    <p style={{ fontSize: 11, color: S.faint, margin: '0 0 2px', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                      NT${p.sellPrice.toLocaleString()}
                    </p>
                  )}
                  <p style={{ fontSize: 22, fontWeight: 900, color: C.primary, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                    NT${bestPrice.toLocaleString()}
                  </p>
                  {hasDiscount && (
                    <p style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, margin: '2px 0 0' }}>
                      省 NT${savedAmount.toLocaleString()}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); cart.toggle(p) }}
                    aria-label={inCart ? '從購物車移除' : '加入購物車'}
                    style={{
                      width: 38, height: 38, borderRadius: 11,
                      background: inCart ? C.primary : tier.bg,
                      color: inCart ? C.onPrimary : tier.fg,
                      border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {inCart ? <CheckIcon /> : <PlusIcon />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectProduct(p.id)}
                    style={{
                      background: C.primary, borderRadius: 11, border: 'none',
                      padding: '9px 16px', fontSize: 13, fontWeight: 800,
                      color: C.onPrimary, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      WebkitTapHighlightColor: 'transparent',
                      letterSpacing: '0.02em',
                    }}
                  >
                    購買
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 適用國家彈窗（共用元件）*/}
      <CoveragePopup open={showCoverage} onClose={() => setShowCoverage(false)} list={coverageList} accentColor={getAccentColor(selectedCountry)} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured card — bigger, gradient background based on tier
// ─────────────────────────────────────────────────────────────────────────────

interface FeaturedCardProps {
  display: ReturnType<typeof annotatePlans>[number]
  coupons: Parameters<typeof calcBestPrice>[0]
  colors: ProductsTemplateProps['colors']
  inCart: boolean
  onToggleCart: () => void
  onSelectProduct: () => void
}

function FeaturedCard({ display: d, coupons, colors: C, inCart, onToggleCart, onSelectProduct }: FeaturedCardProps) {
  const p = d.plan
  const { bestPrice, savedAmount, hasDiscount } = calcBestPrice(coupons, p.sellPrice)
  const tier = TIER_COLOR[d.tier]

  return (
    <div style={{
      position: 'relative',
      borderRadius: 22,
      background: `linear-gradient(140deg, ${tier.bg} 0%, ${S.white} 60%)`,
      boxShadow: '0 8px 28px rgba(15,23,42,0.10), 0 0 0 1.5px #fbbf24',
      overflow: 'hidden',
      padding: '22px 20px 20px',
    }}>
      {/* Ribbon */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        color: '#fff',
        fontSize: 11, fontWeight: 800,
        padding: '6px 14px',
        borderBottomLeftRadius: 12,
        letterSpacing: '0.08em',
      }}>
        最划算
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 11, fontWeight: 800, color: tier.accent,
            background: tier.bg, borderRadius: 8, padding: '4px 10px',
            display: 'inline-block',
            letterSpacing: '0.08em', margin: '0 0 12px',
          }}>{TIER_LABEL[d.tier]}</p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: S.ink, letterSpacing: '-0.05em', lineHeight: 1 }}>{p.displayDays}</span>
            <span style={{ fontSize: 16, color: S.muted, fontWeight: 600 }}>天方案</span>
          </div>

          {p.dataCapacity && (
            <p style={{ fontSize: 15, fontWeight: 800, color: S.ink, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
              {p.dataCapacity}
            </p>
          )}
          {(p.networkType || p.isNativeSim) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
              <NetworkBadge networkType={p.networkType} size="md" />
              <NativeSimBadge isNative={p.isNativeSim} size="md" />
            </div>
          )}
          {d.totalGB > 0 && !d.isUnlimited && d.isPerDay && (
            <p style={{ fontSize: 12, color: S.muted, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              共 {Math.round(d.totalGB)} GB
            </p>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {hasDiscount && (
            <p style={{ fontSize: 11, color: S.faint, margin: '0 0 2px', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
              NT${p.sellPrice.toLocaleString()}
            </p>
          )}
          <p style={{ fontSize: 28, fontWeight: 900, color: C.primary, margin: 0, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            NT${bestPrice.toLocaleString()}
          </p>
          {hasDiscount && (
            <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, margin: '4px 0 0' }}>
              省 NT${savedAmount.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={onToggleCart}
          aria-label={inCart ? '從購物車移除' : '加入購物車'}
          style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: inCart ? C.primary : '#fff',
            color: inCart ? C.onPrimary : C.primary,
            border: inCart ? 'none' : `1.5px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {inCart ? <CheckIcon /> : <PlusIcon />}
        </button>
        <button
          type="button"
          onClick={onSelectProduct}
          style={{
            flex: 1, background: C.primary, borderRadius: 14, border: 'none',
            padding: '13px', fontSize: 15, fontWeight: 800,
            color: C.onPrimary, cursor: 'pointer',
            letterSpacing: '0.02em',
            boxShadow: `0 6px 18px ${C.primary}44`,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          立即購買
        </button>
      </div>
    </div>
  )
}
