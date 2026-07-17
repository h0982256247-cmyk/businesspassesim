'use client'

import { useRouter } from 'next/navigation'
import { BeeLogoSVG } from '@/components/liff/LiffIllustrations'
import type { TenantColors } from '@/components/liff/TenantContext'

interface SetupModalProps {
  slug: string
  onDismiss: () => void
  colors: TenantColors
  logoUrl: string | null
}

export default function SetupModal({ slug, onDismiss, colors: C, logoUrl }: SetupModalProps) {
  const router = useRouter()
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
      animation: 'smFadeIn 0.2s ease',
    }}>
      <div style={{
        background: '#fff', borderRadius: 24,
        padding: '36px 24px 28px', width: '100%', maxWidth: 360,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        animation: 'smScaleIn 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: 76, height: 76, borderRadius: '50%',
          background: logoUrl ? 'transparent' : '#FFF8E1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20, overflow: 'hidden',
        }}>
          {logoUrl
            ? <img src={logoUrl} alt="logo" style={{ width: 76, height: 76, objectFit: 'contain', borderRadius: '50%' }} />
            : <BeeLogoSVG size={48} />
          }
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a', textAlign: 'center', margin: '0 0 8px' }}>
          完成個人資料綁定
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 1.65, margin: '0 0 20px' }}>
          填寫基本資料後，即可獲得
        </p>

        <div style={{
          width: '100%', background: '#F9F5E7',
          border: '2px dashed #92400e', borderRadius: 16,
          padding: '18px 20px 20px', marginBottom: 28, textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', margin: '0 0 6px', letterSpacing: '0.1em' }}>新用戶限定</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#78350f', margin: 0 }}>官方 9 折優惠券</p>
        </div>

        <button
          onClick={() => router.push(`/liff/${slug}/profile/setup`)}
          style={{
            width: '100%', border: 'none', borderRadius: 100,
            padding: '16px', fontSize: 16, fontWeight: 800,
            color: C.onPrimary, cursor: 'pointer', background: C.primary,
            boxShadow: `0 4px 14px ${C.primary}44`, marginBottom: 4,
          }}
        >
          前往綁定
        </button>

        <button
          onClick={onDismiss}
          style={{
            width: '100%', background: 'none', border: 'none',
            padding: '11px', fontSize: 13, color: '#94a3b8', cursor: 'pointer',
          }}
        >
          稍後再說
        </button>
      </div>
      <style>{`
        @keyframes smFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes smScaleIn { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }
      `}</style>
    </div>
  )
}
