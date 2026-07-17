'use client'

import { useState } from 'react'
import { CouponIllustration } from '@/components/liff/LiffIllustrations'
import { useTenantColors } from '@/components/liff/TenantContext'
import { useCachedData } from '@/hooks/useCachedData'
import PageSkeleton from '@/components/liff/PageSkeleton'

type Coupon = {
  id: string
  type: string
  level: 'A' | 'B' | 'C'
  discount: number
  isOfficial: boolean
  expiresAt: string | null
  usedAt: string | null
  createdAt: string
}

const S = {
  white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)',
} as const

const TYPE_LABEL: Record<string, string> = {
  OFFICIAL_WELCOME: '歡迎券',
  GROUP_JOIN:       '入群券',
  GROUP_REPURCHASE: '回購券',
  GROUP_OWNER:      '社群主專屬',
  GROUP_ACTIVITY:   '活動券',
}

const LEVEL_META: Record<string, { bg: string; color: string }> = {
  A: { bg: '#fef2f2', color: '#b91c1c' },
  B: { bg: '#fff7ed', color: '#c2410c' },
  C: { bg: '#f0fdf4', color: '#15803d' },
}

function discountLabel(d: number) {
  return `${Math.round((1 - d) * 100)}% OFF`
}

function discountFold(d: number) {
  // 0.90→9 折、0.85→85 折、0.92→92 折（原本 Math.round(d*10) 對非整十折會算錯，
  // 例：0.85→9 折）。整十折顯示個位數，其餘顯示兩位數。
  const n = Math.round(d * 100)
  return n % 10 === 0 ? `${n / 10} 折` : `${n} 折`
}

export default function CouponsPage() {
  const C = useTenantColors()
  const [tab, setTab] = useState<'available' | 'used'>('available')

  const { data, loading } = useCachedData('coupons', async () => {
    const d = await fetch('/api/coupons').then(r => r.json())
    return { coupons: (d.coupons ?? []) as Coupon[] }
  })
  const coupons = data?.coupons ?? []

  const now = new Date()
  const available = coupons.filter(c => !c.usedAt && (!c.expiresAt || new Date(c.expiresAt) > now))
  const used = coupons.filter(c => c.usedAt || (c.expiresAt && new Date(c.expiresAt) <= now))
  const list = tab === 'available' ? available : used

  if (loading) return <PageSkeleton rows={4} />

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 96 }}>
      <div style={{ padding: '24px 20px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 16px', letterSpacing: '-0.02em' }}>優惠券</h1>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 16, gap: 4 }}>
          {(['available', 'used'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9,
                fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t ? S.white : 'transparent',
                color: tab === t ? C.primary : S.faint,
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t === 'available' ? `可使用 ${available.length}` : `已使用／過期 ${used.length}`}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
            <CouponIllustration size={80} />
            <p style={{ fontSize: 14, color: S.faint }}>
              {tab === 'available' ? '目前沒有可使用的優惠券' : '沒有使用紀錄'}
            </p>
          </div>
        )}

        {list.map(c => {
          const lv = LEVEL_META[c.level] ?? LEVEL_META.C
          const expired = !c.usedAt && c.expiresAt && new Date(c.expiresAt) <= now
          const inactive = !!(c.usedAt || expired)
          return (
            <div
              key={c.id}
              style={{
                background: S.white, borderRadius: 16,
                border: `1px solid ${S.line}`,
                overflow: 'hidden', opacity: inactive ? 0.5 : 1,
                display: 'flex', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              {/* Left accent strip */}
              <div style={{
                width: 56, flexShrink: 0,
                background: inactive ? '#f8f9fb' : lv.bg,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                borderRight: `1px dashed ${S.line}`,
                padding: '16px 0',
              }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: inactive ? S.faint : lv.color }}>{c.level}</span>
                <span style={{ fontSize: 9, color: inactive ? S.faint : lv.color, fontWeight: 600, letterSpacing: '0.05em' }}>LEVEL</span>
              </div>

              {/* Content */}
              <div style={{ flex: 1, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: S.ink, margin: 0 }}>
                      {TYPE_LABEL[c.type] ?? c.type}
                    </p>
                    {c.isOfficial && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '1px 7px', borderRadius: 100 }}>
                        官方
                      </span>
                    )}
                  </div>
                  {c.usedAt ? (
                    <p style={{ fontSize: 12, color: S.faint, margin: 0 }}>已於 {new Date(c.usedAt).toLocaleDateString('zh-TW')} 使用</p>
                  ) : c.expiresAt ? (
                    <p style={{ fontSize: 12, color: expired ? '#ef4444' : S.faint, margin: 0 }}>
                      {expired ? '已過期' : `有效至 ${new Date(c.expiresAt).toLocaleDateString('zh-TW')}`}
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: S.faint, margin: 0 }}>無使用期限</p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 20, fontWeight: 800, color: inactive ? S.faint : C.primary, margin: 0, letterSpacing: '-0.02em' }}>
                    {discountLabel(c.discount)}
                  </p>
                  <p style={{ fontSize: 11, color: S.faint, margin: 0 }}>{discountFold(c.discount)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
