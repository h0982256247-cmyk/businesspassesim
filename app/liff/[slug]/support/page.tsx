'use client'

import { useTenantColors, useTenant } from '@/components/liff/TenantContext'

const S = {
  white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)',
} as const

const FAQS = [
  {
    q: 'eSIM 如何安裝？',
    a: '付款完成後，在訂單頁面掃描 QR Code，或複製 LPA 碼手動輸入。iOS 14+ / Android 12+ 支援 eSIM。',
  },
  {
    q: '啟動碼多久會寄出？',
    a: '通常付款後 5 分鐘內完成。若超過 30 分鐘，請聯繫 LINE 客服。',
  },
  {
    q: '可以退款嗎？',
    a: '啟動碼尚未使用前，可聯繫客服申請退款。已安裝使用的 eSIM 恕不退款。',
  },
  {
    q: '優惠券可以合併使用嗎？',
    a: 'A 級券（折扣 80% 以下）不可與任何券合用；B 級券可搭配 1 張 C 級券；C 級券最多同時使用 3 張。',
  },
]

function LineIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={S.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export default function SupportPage() {
  const C = useTenantColors()
  const tenant = useTenant()

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 20px', letterSpacing: '-0.02em' }}>客服中心</h1>

      {/* LINE 客服（導向後台設定的官方帳號連結；未設定則不顯示此卡）*/}
      {tenant?.lineOaUrl && (
      <a
        href={tenant.lineOaUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: S.white, borderRadius: 16,
          border: `1px solid ${S.line}`,
          padding: '16px 18px', marginBottom: 16,
          textDecoration: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: C.light,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.primaryText,
        }}>
          <LineIcon />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: 0 }}>LINE 客服</p>
          <p style={{ fontSize: 12, color: S.faint, margin: '3px 0 0' }}>週一至週五 10:00–18:00</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </a>
      )}

      {/* FAQ */}
      <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: S.faint, letterSpacing: '0.08em', margin: 0, padding: '14px 18px 10px', borderBottom: `1px solid ${S.line}` }}>
          常見問題
        </p>
        {FAQS.map(({ q, a }, i) => (
          <details
            key={q}
            style={{
              borderTop: i > 0 ? `1px solid ${S.line}` : 'none',
            }}
          >
            <summary style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', fontSize: 14, fontWeight: 600, color: S.ink,
              cursor: 'pointer', listStyle: 'none', gap: 8,
            }}>
              {q}
              <span style={{ flexShrink: 0 }}><ChevronDown /></span>
            </summary>
            <p style={{ fontSize: 13, color: S.muted, margin: 0, padding: '0 18px 16px', lineHeight: 1.65 }}>{a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
