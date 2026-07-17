// 首頁快速功能 SVG 圖示（統一線條風格）

export function IconMyEsim({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="3"/>
      <path d="M9 2v3h6V2"/>
      <rect x="8" y="11" width="3" height="3" rx="0.5" strokeWidth="1.4"/>
      <line x1="13" y1="12" x2="16" y2="12"/>
      <line x1="13" y1="15" x2="16" y2="15"/>
      <line x1="8" y1="17" x2="16" y2="17" strokeWidth="1.2"/>
    </svg>
  )
}

export function IconGuide({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="9" y1="7" x2="15" y2="7"/>
      <line x1="9" y1="11" x2="15" y2="11"/>
      <line x1="9" y1="15" x2="12" y2="15"/>
    </svg>
  )
}

export function IconDataPlan({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="16" width="4" height="5" rx="1"/>
      <rect x="9" y="11" width="4" height="10" rx="1"/>
      <rect x="16" y="6" width="4" height="15" rx="1"/>
      <path d="M4 13l3-3 4-2 4-4 4-2" strokeWidth="1.4" strokeDasharray="0"/>
    </svg>
  )
}

export function IconDevices({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <circle cx="12" cy="17" r="1" fill={color} strokeWidth="0"/>
      <path d="M9 7l2 2 4-4" strokeWidth="1.8"/>
    </svg>
  )
}
