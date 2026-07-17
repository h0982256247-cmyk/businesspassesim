// 禮物 SVG（取代 🎁 emoji）：盒身/盒蓋淡色填底、緞帶與蝴蝶結用傳入色（通常帶租戶主題色）。
// 共用於訂單詳情「已回饋」橫幅與訂單列表「購買完成」彈窗。
export function GiftIcon({ size = 44, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="9" y="22" width="30" height="19" rx="3" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="7" y="15" width="34" height="9" rx="2.5" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="21" y="16" width="6" height="25" fill={color} />
      <path d="M24 15C19.5 8 12.5 9.5 13.5 14C14.2 17 20.5 16 24 15Z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <path d="M24 15C28.5 8 35.5 9.5 34.5 14C33.8 17 27.5 16 24 15Z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <circle cx="24" cy="14.5" r="2.6" fill={color} />
    </svg>
  )
}
