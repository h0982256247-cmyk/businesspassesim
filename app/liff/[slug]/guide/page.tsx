'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenantColors } from '@/components/liff/TenantContext'
import { useLiffBase } from '@/hooks/useLiffBase'

const S = {
  ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)', white: '#ffffff',
} as const

type Os = 'ios' | 'android'
type IconKey = 'wifi' | 'simAdd' | 'qr' | 'signal' | 'toggleOff' | 'pin' | 'simCheck' | 'toggleOn'

interface Step { icon: IconKey; title: string; desc: string }

const STEPS: Record<Os, Step[]> = {
  ios: [
    { icon: 'wifi',      title: '準備安裝環境',  desc: '建議先連上 Wi-Fi，再開始安裝 eSIM。' },
    { icon: 'simAdd',    title: '加入 eSIM',     desc: '前往手機「設定 → 行動服務」，點選「加入 eSIM」。' },
    { icon: 'qr',        title: '掃描 QR Code',  desc: '使用另一支手機或列印出的 QR Code 進行掃描安裝。' },
    { icon: 'signal',    title: '設定行動數據',  desc: '安裝完成後，進入行動方案設定，確認 eSIM 已加入。' },
    { icon: 'toggleOff', title: '關閉數據切換',  desc: '「允許行動數據切換」請保持關閉狀態。' },
    { icon: 'pin',       title: '抵達後再啟用',  desc: '未到目的地前，eSIM 與數據漫遊請先保持關閉；抵達後再開啟使用。' },
  ],
  android: [
    { icon: 'wifi',      title: '準備安裝環境',     desc: '建議先連上 Wi-Fi，再開始安裝 eSIM。' },
    { icon: 'qr',        title: '掃描安裝 QR Code', desc: '使用第二支裝置顯示，或列印出供應商提供的 QR Code 進行安裝。' },
    { icon: 'simCheck',  title: '確認 eSIM 已加入', desc: '安裝完成後，可在 SIM 卡頁面查看 eSIM。未到目的地前，請先保持關閉狀態。' },
    { icon: 'toggleOn',  title: '抵達後再啟用',     desc: '到達目的地後，再開啟「使用 eSIM」與「漫遊」。暫不用的原門號建議關閉。' },
  ],
}

function StepIcon({ name }: { name: IconKey }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'wifi': return <svg {...p}><path d="M5 12.6a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><line x1="12" y1="19.5" x2="12.01" y2="19.5" /></svg>
    case 'simAdd': return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="2.5" /><line x1="12" y1="9" x2="12" y2="15" /><line x1="9" y1="12" x2="15" y2="12" /></svg>
    case 'qr': return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="15" y="15" width="5" height="5" rx="1.2" /></svg>
    case 'signal': return <svg {...p}><line x1="6" y1="20" x2="6" y2="14" /><line x1="12" y1="20" x2="12" y2="9" /><line x1="18" y1="20" x2="18" y2="4" /></svg>
    case 'toggleOff': return <svg {...p}><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="8" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>
    case 'toggleOn': return <svg {...p}><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="16" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>
    case 'pin': return <svg {...p}><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
    case 'simCheck': return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8.5 12.5l2.4 2.4 4.6-5" /></svg>
  }
}

export default function GuidePage() {
  const C = useTenantColors()
  const base = useLiffBase()
  const router = useRouter()
  const [os, setOs] = useState<Os>('ios')

  // 預設依使用者裝置切到對應分頁
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) setOs('android')
  }, [])

  const steps = STEPS[os]

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 4px', letterSpacing: '-0.02em' }}>eSIM 安裝教學</h1>
      <p style={{ fontSize: 13, color: S.faint, margin: '0 0 18px' }}>依你的手機系統，跟著步驟操作即可完成</p>

      {/* iOS / Android 切換 */}
      <div style={{ display: 'flex', gap: 4, background: C.light, borderRadius: 100, padding: 4, marginBottom: 22 }}>
        {(['ios', 'android'] as const).map(key => {
          const active = os === key
          return (
            <button
              key={key}
              onClick={() => setOs(key)}
              style={{
                flex: 1, border: 'none', cursor: 'pointer', borderRadius: 100, padding: '9px 0',
                fontSize: 14, fontWeight: 700, transition: 'background .15s, color .15s',
                background: active ? C.primary : 'transparent',
                color: active ? C.onPrimary : C.primaryText,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {key === 'ios' ? 'iPhone (iOS)' : 'Android'}
            </button>
          )
        })}
      </div>

      {/* 步驟列：左側編號＋連接線，右側卡片 */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 17, top: 20, bottom: 20, width: 2, background: C.border, borderRadius: 2 }} />
        {steps.map((s, i) => (
          <div key={`${os}-${i}`} style={{ display: 'flex', gap: 14, marginBottom: i === steps.length - 1 ? 0 : 14, position: 'relative' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0, zIndex: 1,
              background: C.primary, color: C.onPrimary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>{i + 1}</div>
            <div style={{
              flex: 1, minWidth: 0, background: S.white, border: `1px solid ${S.line}`, borderRadius: 16,
              padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: C.light, color: C.primaryText,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><StepIcon name={s.icon} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: S.ink, margin: 0 }}>{s.title}</p>
                <p style={{ fontSize: 13, color: S.muted, margin: '4px 0 0', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 前往我的 eSIM */}
      <button
        onClick={() => router.push(`${base}/orders`)}
        style={{
          width: '100%', marginTop: 22, border: 'none', cursor: 'pointer', borderRadius: 100,
          padding: '14px', fontSize: 15, fontWeight: 800, background: C.primary, color: C.onPrimary,
        }}
      >
        前往我的 eSIM
      </button>
    </div>
  )
}
