// 首頁快速功能 SVG 圖示（duotone：品牌淡底 fillOpacity + 主色重點，搭配通透版快速功能）
// color 帶入品牌主色（C.primary）；淡底用 fillOpacity 而非寫死 hex，任何品牌色都安全。

export function IconMyEsim({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7.5 3H13l5 5v11.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3z" fill={color} fillOpacity={0.16} />
      <path d="M7.5 3H13l5 5v11.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 3v4a1 1 0 0 0 1 1h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9" y="12" width="6" height="5.4" rx="1.2" fill={color} />
    </svg>
  )
}

export function IconGuide({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="2.5" fill={color} fillOpacity={0.16} />
      <rect x="5" y="3" width="14" height="18" rx="2.5" stroke={color} strokeWidth="1.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconDataPlan({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="13" width="4" height="7" rx="1.2" fill={color} fillOpacity={0.16} />
      <rect x="10" y="9" width="4" height="11" rx="1.2" fill={color} fillOpacity={0.16} />
      <rect x="4" y="13" width="4" height="7" rx="1.2" stroke={color} strokeWidth="1.3" />
      <rect x="10" y="9" width="4" height="11" rx="1.3" stroke={color} strokeWidth="1.3" />
      <rect x="16" y="5" width="4" height="15" rx="1.2" fill={color} />
    </svg>
  )
}

export function IconDevices({ color = '#374151', size = 24 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="6" y="2.5" width="12" height="19" rx="3" fill={color} fillOpacity={0.16} />
      <rect x="6" y="2.5" width="12" height="19" rx="3" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="11" r="3.4" fill={color} />
      <path d="M10.6 11l1 1 1.7-1.9" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
