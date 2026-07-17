'use client'

// 「適用國家」共用元件：解析匯入 L 欄字串 + 質感彈窗。ClassicShop / MagazineShop 共用，
// 各自渲染自己風格的觸發按鈕，彈窗一致（改樣式只改這裡）。

// 把「適用國家」原字串依常見分隔符拆成清單。
export function getCoverageList(raw: string | null | undefined): string[] {
  return raw ? raw.split(/[、,，;；/\n\s]+/).map(s => s.trim()).filter(Boolean) : []
}

export function CoveragePopup({
  open, onClose, list, accentColor,
}: {
  open: boolean
  onClose: () => void
  list: string[]
  accentColor: string   // 6 碼 hex，如 #E86A5A（標題列漸層 + chip 用）
}) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 90 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 360, maxHeight: '74vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
      >
        {/* 彩色標題列 */}
        <div style={{ padding: '18px 20px', background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>適用國家</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', margin: '2px 0 0', fontWeight: 600 }}>共 {list.length} 個國家／地區可用</p>
          </div>
          <button onClick={onClose} aria-label="關閉" style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.22)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {/* 國家 chips（純中文，無國旗）*/}
        <div style={{ padding: '16px 18px 20px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {list.map((name, i) => (
            <span key={`${name}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', background: `${accentColor}1a`, color: accentColor, borderRadius: 100, padding: '7px 14px', fontSize: 13, fontWeight: 700 }}>
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
