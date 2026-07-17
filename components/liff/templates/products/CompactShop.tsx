'use client'

import { useMemo, useState } from 'react'
import { calcBestPrice } from '@/lib/utils/coupon-combo'
import { CountryFlag } from '@/components/common/CountryFlag'
import DayPicker from '@/components/liff/DayPicker'
import { annotatePlans, sortByValue, TIER_LABEL, TIER_COLOR, type DataTier } from '@/lib/utils/product-display'
import { NetworkBadge, NativeSimBadge } from '@/components/liff/ProductBadges'
import type { ProductsTemplateProps } from './types'

const S = {
  ink: '#0b0f17', muted: '#475569', faint: '#94a3b8',
  white: '#ffffff', bg: '#f4f5f8', line: 'rgba(15,23,42,0.06)',
} as const

function BackArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function PlusIconSm() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CheckIconSm() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function StarIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15 9 22 9 17 14 19 22 12 17 5 22 7 14 2 9 9 9" />
    </svg>
  )
}

const TIER_ORDER: DataTier[] = ['light', 'standard', 'medium', 'heavy', 'unlimited', 'titanium', 'highspeed', 'unknown']

export default function CompactShop({
  countries, products, coupons, selectedCountry,
  colors: C, onSelectCountry, onSelectProduct, onBack,
  filter, cart,
}: ProductsTemplateProps) {
  const [tierFilter, setTierFilter] = useState<DataTier | 'all'>('all')

  // Hooks 一律在任何 early return 之前呼叫（react-hooks/rules-of-hooks）
  const displays = useMemo(() => sortByValue(annotatePlans(products)), [products])
  const availableTiers = useMemo(() => {
    const set = new Set<DataTier>()
    displays.forEach(d => set.add(d.tier))
    return TIER_ORDER.filter(t => set.has(t))
  }, [displays])
  const visible = useMemo(() => {
    if (tierFilter === 'all') return displays
    return displays.filter(d => d.tier === tierFilter)
  }, [displays, tierFilter])

  if (!selectedCountry) {
    return (
      <div style={{ paddingBottom: 96, background: S.white, minHeight: '100vh' }}>
        <div style={{
          padding: '20px 16px 12px',
          borderBottom: `1px solid ${S.line}`,
          background: S.white,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: S.ink, letterSpacing: '-0.02em', margin: '0 0 10px' }}>選擇目的地</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, background: S.bg, borderRadius: 12,
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={S.faint} strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span style={{ fontSize: 14, color: S.faint }}>搜尋目的地</span>
            </div>
          </div>
        </div>

        <div style={{ background: S.white }}>
          {countries.length === 0 && (
            <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>目前沒有可購買的商品</p>
          )}
          {countries.map((c, i) => (
            <button
              key={c.countryCode}
              onClick={() => onSelectCountry(c.countryCode)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                background: 'none', border: 'none',
                borderBottom: i < countries.length - 1 ? `1px solid ${S.line}` : 'none',
                padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ width: 32, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
                <CountryFlag code={c.countryCode} fallbackEmoji={c.countryFlag} size={28} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: S.ink, margin: 0 }}>{c.countryNameZh}</p>
                <p style={{ fontSize: 11, color: S.faint, margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{c.countryNameEn}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.faint} strokeWidth="2" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const country = countries.find(c => c.countryCode === selectedCountry)
  const showNoMatch = filter.dayFilter > 0 && filter.filteredCount === 0

  return (
    <div style={{ paddingBottom: 96, background: S.bg, minHeight: '100vh' }}>
      {/* Sticky top bar */}
      <div style={{
        background: S.white, padding: '12px 16px',
        borderBottom: `1px solid ${S.line}`,
        position: 'sticky', top: 0, zIndex: 11,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, padding: 4, display: 'flex', alignItems: 'center' }}>
          <BackArrow />
        </button>
        {country && <CountryFlag code={country.countryCode} fallbackEmoji={country.countryFlag} size={26} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: S.ink, margin: 0, letterSpacing: '-0.01em' }}>{country?.countryNameZh}</p>
          <p style={{ fontSize: 11, color: S.faint, margin: 0 }}>
            {filter.dayFilter ? `${filter.filteredCount} / ${filter.totalCount} 個方案` : `${filter.totalCount} 個方案`}
          </p>
        </div>
        {filter.dayFilter > 0 && (
          <button
            type="button"
            onClick={filter.onClear}
            style={{
              background: 'transparent', border: `1px solid ${S.line}`, color: S.muted,
              fontSize: 11, fontWeight: 600, padding: '4px 9px',
              borderRadius: 100, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >全部</button>
        )}
      </div>

      {/* DayPicker compact */}
      {filter.availableDays.length > 0 && (
        <div style={{ padding: '10px 16px 0', background: S.white }}>
          <DayPicker
            value={filter.pickerDays}
            onChange={filter.onChange}
            min={filter.minDay}
            max={filter.maxDay}
            presets={filter.presets}
            label="想用幾天？"
            caption={filter.dayFilter
              ? (filter.filteredCount > 0 ? `${filter.filteredCount} 個方案` : `沒有 ${filter.dayFilter} 天方案`)
              : '點 +/− 篩選'}
            compact
          />
        </div>
      )}

      {/* 流量類型：總量 / 每日型 / 吃到飽（對應主頁搜尋；不選＝全部，再點一下取消）。
          與下方「容量分級」是兩個維度：先粗分流量類型，再細分容量。*/}
      {filter.availableDays.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8,
          padding: '10px 16px 0', background: S.white, flexWrap: 'wrap',
        }}>
          {filter.dataOptions.map(opt => {
            const active = filter.dataType === opt
            return (
              <button
                key={opt}
                onClick={() => filter.onDataType(active ? null : opt)}
                style={{
                  padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
                  border: active ? `1.5px solid ${C.primary}` : '1.5px solid rgba(15,23,42,0.08)',
                  background: active ? C.primary : '#fff',
                  color: active ? C.onPrimary : S.muted,
                  fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.12s',
                }}
              >{opt}</button>
            )
          })}
        </div>
      )}

      {/* Tier filter chips */}
      {availableTiers.length > 1 && (
        <div style={{
          padding: '10px 16px 10px',
          background: S.white,
          borderBottom: `1px solid ${S.line}`,
          display: 'flex', gap: 6, overflowX: 'auto',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
        }}>
          {(['all', ...availableTiers] as const).map(t => {
            const active = tierFilter === t
            const color = t === 'all' ? null : TIER_COLOR[t as DataTier]
            return (
              <button
                key={t}
                onClick={() => setTierFilter(t as DataTier | 'all')}
                style={{
                  flex: '0 0 auto',
                  padding: '6px 12px', borderRadius: 100,
                  border: active
                    ? `1.5px solid ${color ? color.accent : C.primary}`
                    : '1.5px solid rgba(15,23,42,0.08)',
                  background: active
                    ? (color ? color.bg : C.light)
                    : '#fff',
                  color: active
                    ? (color ? color.fg : C.primary)
                    : '#64748b',
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.12s',
                }}
              >
                {t === 'all' ? '全部流量' : TIER_LABEL[t as DataTier]}
              </button>
            )
          })}
        </div>
      )}

      {/* Plan list */}
      <div style={{ background: S.white, marginTop: 0 }}>
        {filter.totalCount === 0 && (
          <p style={{ textAlign: 'center', color: S.faint, padding: '48px 0', fontSize: 14 }}>此目的地暫無可購買方案</p>
        )}

        {showNoMatch && filter.nearestDays.length > 0 && (
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: 13, color: S.muted, margin: '0 0 8px' }}>相近天數：</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {filter.nearestDays.map(n => (
                <button
                  key={n}
                  onClick={() => filter.onChange(n)}
                  style={{
                    padding: '6px 12px', borderRadius: 100,
                    border: `1px solid ${C.border}`, background: C.light, color: C.primary,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >{n} 天</button>
              ))}
            </div>
          </div>
        )}

        {visible.length === 0 && tierFilter !== 'all' && (
          <p style={{ textAlign: 'center', color: S.faint, padding: '32px 0', fontSize: 13 }}>
            此天數沒有「{TIER_LABEL[tierFilter]}」方案
          </p>
        )}

        {visible.map((d, i) => {
          const p = d.plan
          const { bestPrice, savedAmount, hasDiscount } = calcBestPrice(coupons, p.sellPrice)
          const inCart = cart.has(p.id)
          const tier = TIER_COLOR[d.tier]
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'stretch',
                borderBottom: i < visible.length - 1 ? `1px solid ${S.line}` : 'none',
                position: 'relative',
              }}
            >
              {/* Tier color stripe */}
              <div style={{ width: 4, background: tier.accent, flexShrink: 0 }} />

              <button
                onClick={() => onSelectProduct(p.id)}
                style={{
                  flex: 1, textAlign: 'left', background: 'none', border: 'none',
                  padding: '14px 14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Days */}
                <div style={{ minWidth: 44, textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: S.ink, margin: 0, lineHeight: 1, letterSpacing: '-0.03em' }}>{p.displayDays}</p>
                  <p style={{ fontSize: 10, color: S.faint, margin: '3px 0 0', letterSpacing: '0.1em', fontWeight: 600 }}>天</p>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    {p.dataCapacity && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: S.ink, letterSpacing: '-0.01em' }}>
                        {p.dataCapacity}
                      </span>
                    )}
                    <NetworkBadge networkType={p.networkType} />
                    <NativeSimBadge isNative={p.isNativeSim} />
                    {d.recommended && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 800, color: '#a16207',
                        background: '#fef3c7', borderRadius: 4, padding: '2px 6px',
                        letterSpacing: '0.05em',
                      }}>
                        <StarIcon size={10} /> 最划算
                      </span>
                    )}
                  </div>
                  {d.totalGB > 0 && !d.isUnlimited && d.isPerDay && (
                    <p style={{ fontSize: 11, color: S.muted, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                      共 {Math.round(d.totalGB)} GB
                    </p>
                  )}
                </div>

                {/* Price */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {hasDiscount ? (
                    <>
                      <p style={{ fontSize: 10, color: S.faint, margin: 0, textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                        NT${p.sellPrice.toLocaleString()}
                      </p>
                      <p style={{ fontSize: 17, fontWeight: 900, color: C.primary, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        NT${bestPrice.toLocaleString()}
                      </p>
                      <p style={{ fontSize: 9, color: '#16a34a', fontWeight: 700, margin: 0 }}>省 {savedAmount}</p>
                    </>
                  ) : (
                    <p style={{ fontSize: 17, fontWeight: 900, color: C.primary, margin: 0, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                      NT${p.sellPrice.toLocaleString()}
                    </p>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); cart.toggle(p) }}
                aria-label={inCart ? '從購物車移除' : '加入購物車'}
                style={{
                  width: 44, flexShrink: 0,
                  background: inCart ? C.primary : 'transparent',
                  color: inCart ? C.onPrimary : C.primary,
                  border: 'none', borderLeft: `1px solid ${S.line}`,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {inCart ? <CheckIconSm /> : <PlusIconSm />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
