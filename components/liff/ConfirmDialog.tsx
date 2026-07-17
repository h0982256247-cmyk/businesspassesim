'use client'

import type { ReactNode } from 'react'
import type { TenantColors } from '@/components/liff/TenantContext'

// 統一的 In-App 確認彈窗。取代瀏覽器原生 window.confirm —— 原生對話框在 LINE
// 內建瀏覽器會在標題列露出網域（網址），且無法調整文案與外觀。此元件純 inline
// CSS-in-JS、用租戶色，置中卡片＋遮罩，不顯示任何網址。
export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** 內文段落（每段一行，置中）。 */
  lines?: string[]
  confirmLabel: string
  cancelLabel?: string
  /** primary＝品牌色；danger＝紅色（不可逆動作）。 */
  tone?: 'primary' | 'danger'
  icon?: ReactNode
  colors: TenantColors
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, lines = [], confirmLabel, cancelLabel = '取消',
  tone = 'primary', icon, colors: C, onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  const accent = tone === 'danger' ? '#dc2626' : C.primary
  const accentOn = tone === 'danger' ? '#ffffff' : C.onPrimary
  const iconBg = tone === 'danger' ? '#fef2f2' : C.light

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'cdFade 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 340, background: '#fff', borderRadius: 22,
          padding: '24px 22px 18px', boxSizing: 'border-box',
          boxShadow: '0 20px 50px rgba(15,23,42,0.28)',
          animation: 'cdPop 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {icon && (
          <div style={{
            width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px',
            background: iconBg, color: accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{icon}</div>
        )}
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 10px', textAlign: 'center', letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {lines.map((l, i) => (
          <p key={i} style={{ fontSize: 14, color: '#475569', margin: '0 0 6px', textAlign: 'center', lineHeight: 1.65 }}>
            {l}
          </p>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onCancel}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 100,
              border: '1.5px solid rgba(15,23,42,0.12)', background: '#fff',
              color: '#475569', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm}
            style={{
              flex: 1.4, padding: '12px 0', borderRadius: 100, border: 'none',
              background: accent, color: accentOn, fontSize: 15, fontWeight: 800,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}>
            {confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes cdFade { from{opacity:0} to{opacity:1} }
        @keyframes cdPop { from{opacity:0;transform:translateY(12px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>
    </div>
  )
}
