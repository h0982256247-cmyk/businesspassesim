// eSIM 流程共用細線圖示（取代原本的 emoji）。
// 全部 24×24 viewBox、stroke=currentColor、寬 2、圓角端點 —— 與站內返回箭頭同風格。
// 顏色由父層 color 控制；size 預設 16。
import type { CSSProperties } from 'react'

type IconProps = { size?: number; style?: CSSProperties }

function base(size: number): { width: number; height: number; viewBox: string; fill: string; stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round' } {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
}

// SIM 卡（eSIM 已準備好）
export function IconSim({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <path d="M19 5.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8.5L19 7.5" />
      <rect x="8.5" y="10" width="7" height="6" rx="1" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
    </svg>
  )
}

// 下載／安裝（我要安裝、一鍵安裝）
export function IconInstall({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <path d="M12 3v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  )
}

// 分享／轉贈
export function IconShare({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <line x1="8.3" y1="13.4" x2="15.7" y2="17.6" />
      <line x1="15.7" y1="6.4" x2="8.3" y2="10.6" />
    </svg>
  )
}

// QR 碼（QR 已就緒）
export function IconQr({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3" />
      <path d="M21 14v.01M14 21v.01M17 21h4v-4M21 17v.01" />
    </svg>
  )
}

// 勾選（使用中／已激活）
export function IconCheck({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </svg>
  )
}

// 時鐘（開卡中／已結束）
export function IconClock({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

// 警示三角（即將到期／付款失敗）
export function IconAlert({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9.5" x2="12" y2="13.5" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </svg>
  )
}

// 禮物（收到轉贈）
export function IconGift({ size = 16, style }: IconProps) {
  return (
    <svg {...base(size)} style={style} aria-hidden>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8.5h14V12" />
      <line x1="12" y1="8" x2="12" y2="21" />
      <path d="M12 8S11 3.5 8.5 3.5 6 7 9 8" />
      <path d="M12 8s1-4.5 3.5-4.5S18 7 15 8" />
    </svg>
  )
}
