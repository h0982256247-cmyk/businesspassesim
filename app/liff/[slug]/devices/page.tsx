'use client'

import { useTenantColors } from '@/components/liff/TenantContext'

const S = {
  ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)', white: '#ffffff',
} as const

type BrandKey = 'apple' | 'google' | 'samsung'
interface Model { title: string; note?: string }
interface Brand { key: BrandKey; name: string; models: Model[]; warn?: string }

const BRANDS: Brand[] = [
  {
    key: 'apple', name: 'Apple',
    models: [
      { title: 'iPhone 14 系列', note: '含 14 以上版本' },
      { title: 'iPhone 13 系列' },
      { title: 'iPhone 12 系列' },
      { title: 'iPhone 11 系列' },
      { title: 'iPhone XS 系列' },
      { title: 'iPhone XR 系列' },
      { title: 'iPad Pro 12.9 吋', note: '第三代和後續機型' },
      { title: 'iPad Pro 11 吋系列' },
      { title: 'iPad Air', note: '第三代和後續機型' },
      { title: 'iPad', note: '第七代和後續機型' },
      { title: 'iPad mini', note: '第五代和後續機型' },
    ],
    warn: 'iPad 僅支援 LTE（行動網路）版本',
  },
  {
    key: 'google', name: 'Google Pixel',
    models: [
      { title: 'Pixel 7 系列', note: '含 Pixel 7 以上版本' },
      { title: 'Pixel 6 系列' },
      { title: 'Pixel 5 系列' },
      { title: 'Pixel 4 系列' },
    ],
  },
  {
    key: 'samsung', name: 'Samsung',
    models: [
      { title: '僅有國際版支援' },
      { title: '其餘機型請參考三星官網' },
    ],
  },
]

function BrandMark({ brand, color }: { brand: BrandKey; color: string }) {
  if (brand === 'apple') {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill={color} aria-hidden="true">
        <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.03 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.75-4.13z" />
        <path d="M14.7 4.86c.71-.86 1.19-2.06 1.06-3.26-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.43z" />
      </svg>
    )
  }
  return <span style={{ fontSize: 17, fontWeight: 800, color }}>{brand === 'google' ? 'G' : 'S'}</span>
}

export default function DevicesPage() {
  const C = useTenantColors()

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 4px', letterSpacing: '-0.02em' }}>eSIM 適用裝置</h1>
      <p style={{ fontSize: 13, color: S.faint, margin: '0 0 18px' }}>購買前請先確認您的裝置是否支援 eSIM</p>

      {/* 一鍵檢查（撥打 *#06#） */}
      <a
        href="tel:*%2306%23"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', boxSizing: 'border-box', textDecoration: 'none',
          background: C.primary, color: C.onPrimary, borderRadius: 14, padding: '15px',
          fontSize: 15, fontWeight: 800,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        一鍵檢查我的裝置（撥打 *#06#）
      </a>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 2px 22px' }}>
        <span style={{ flexShrink: 0, color: C.primaryText, marginTop: 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
        </span>
        <p style={{ fontSize: 12.5, color: S.muted, margin: 0, lineHeight: 1.6 }}>
          撥號後若出現 <strong style={{ color: C.primaryText }}>EID</strong> 條碼 → 代表支援 eSIM；若沒有 EID，表示此機型不支援。
        </p>
      </div>

      {/* 品牌清單 */}
      {BRANDS.map(brand => (
        <div key={brand.key} style={{ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BrandMark brand={brand.key} color={C.primaryText} />
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: S.ink }}>{brand.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {brand.models.map(m => (
              <div key={m.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <span style={{ flexShrink: 0, color: C.primaryText, marginTop: 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                </span>
                <span style={{ fontSize: 14, color: S.ink, lineHeight: 1.4 }}>
                  {m.title}
                  {m.note && <span style={{ color: S.faint, fontSize: 12, marginLeft: 6 }}>{m.note}</span>}
                </span>
              </div>
            ))}
          </div>
          {brand.warn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '8px 12px', background: C.light, borderRadius: 10 }}>
              <span style={{ flexShrink: 0, color: C.primaryText }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              </span>
              <span style={{ fontSize: 12.5, color: C.primaryText, fontWeight: 600 }}>{brand.warn}</span>
            </div>
          )}
        </div>
      ))}

      {/* 注意事項 */}
      <div style={{ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: S.faint, letterSpacing: '0.08em', margin: '0 0 10px' }}>注意事項</p>
        {[
          '鎖卡機、中港澳售出的手機通常不支援 eSIM 功能。',
          '訂購前，請務必確認您的手機型號可使用 eSIM。',
        ].map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 9, marginBottom: i === 0 ? 8 : 0 }}>
            <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: C.light, color: C.primaryText, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: S.muted, lineHeight: 1.6 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
