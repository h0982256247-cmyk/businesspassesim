'use client'

import { useRouter } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors, useTenant } from '@/components/liff/TenantContext'
import { S } from '@/lib/liff/tokens'
import { useT } from '@/components/liff/LocaleProvider'

export default function PrivacyPage() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const tenant = useTenant()
  const { t } = useT()
  const P = t.privacy

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 20px', letterSpacing: '-0.02em' }}>{P.title}</h1>

      <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: '18px 18px 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 13, color: S.muted, margin: '0 0 18px', lineHeight: 1.75 }}>{P.intro}</p>

        {P.sections.map(sec => (
          <section key={sec.h} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: '0 0 8px' }}>{sec.h}</h2>
            {sec.body.map(para => (
              <p key={para} style={{ fontSize: 13, color: S.muted, margin: '0 0 8px', lineHeight: 1.75 }}>{para}</p>
            ))}
            {sec.items.length > 0 && (
              <ol style={{ fontSize: 13, color: S.muted, margin: '0 0 8px', paddingLeft: 20, lineHeight: 1.75 }}>
                {sec.items.map(item => <li key={item} style={{ marginBottom: 4 }}>{item}</li>)}
              </ol>
            )}
          </section>
        ))}
      </div>

      {/* 聯繫管道（政策第二節「聯繫方式請見最下方聯繫管道」指向此處）：
          有設定 LINE OA 連結就直開，否則導到客服中心頁 */}
      <div style={{ marginTop: 16, background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: '0 0 6px' }}>{P.contactTitle}</h2>
        <p style={{ fontSize: 13, color: S.muted, margin: '0 0 14px', lineHeight: 1.65 }}>{P.contactBody}</p>
        <button
          className="liff-press"
          onClick={() => tenant?.lineOaUrl
            ? window.open(tenant.lineOaUrl, '_blank', 'noopener,noreferrer')
            : router.push(`${base}/support`)}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
            background: C.light, color: C.primaryText,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {tenant?.lineOaUrl ? P.contactLine : P.contactSupport}
        </button>
      </div>
    </div>
  )
}
