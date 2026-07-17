'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useTenantColors } from '@/components/liff/TenantContext'

function IconHome({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function IconShop({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}

function IconEsim({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <path d="M15 2v4H9V2" />
      <line x1="9" y1="12" x2="9" y2="12" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="12" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  )
}

function IconProfile({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconAdmin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

const ADMIN_PATH = 'group-admin'

// 這些頁面有自己的底部操作列（確認付款／送出等），底部分頁導覽會疊在按鈕上、
// 把按鈕蓋住（看起來像破圖／按不到），所以在這些流程中隱藏分頁導覽。
const HIDE_ON = ['/checkout', '/profile/setup', '/login', '/gift/']

type TabDef = { path: string; label: string; Icon: React.FC<{ size?: number }>; ownerOnly?: boolean; isRoot?: boolean }

const TABS: TabDef[] = [
  { path: '',         label: '主頁',  Icon: IconHome,    isRoot: true },
  { path: 'products', label: '商城',  Icon: IconShop },
  { path: 'orders',   label: 'eSIM',  Icon: IconEsim },
  { path: 'profile',  label: '個人',  Icon: IconProfile },
]

const ADMIN_TAB: TabDef = { path: ADMIN_PATH, label: '後台', Icon: IconAdmin, ownerOnly: true }

function useBasePath() {
  const pathname = usePathname()
  const slugMatch = pathname.match(/^(\/liff\/[^/]+)/)
  if (slugMatch) return slugMatch[1]
  return ''
}

export default function LiffBottomNav() {
  const pathname = usePathname()
  const base = useBasePath()
  const C = useTenantColors()
  const [isGroupOwner, setIsGroupOwner] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ownedGroup?.status === 'APPROVED') setIsGroupOwner(true) })
      .catch(() => {})
  }, [])

  // iOS LINE webview：螢幕鎖定/切到背景再回來後，position:fixed 的底部列「畫面還在但
  // 觸控區失準」→ 點不到。回到前景時強制 reflow（同步 toggle display）重建觸控區。
  useEffect(() => {
    const repaint = () => {
      const el = navRef.current
      if (!el) return
      el.style.display = 'none'
      void el.offsetHeight   // 觸發同步 reflow（不會閃，因同一個 tick 內還原）
      el.style.display = ''
    }
    const onVisible = () => { if (document.visibilityState === 'visible') repaint() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', repaint)
    window.addEventListener('focus', repaint)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', repaint)
      window.removeEventListener('focus', repaint)
    }
  }, [])

  const tabs = isGroupOwner ? [...TABS, ADMIN_TAB] : TABS

  // 結帳／付款等流程隱藏底部分頁導覽，避免蓋住頁面自己的操作按鈕
  if (HIDE_ON.some(p => pathname.includes(p))) return null

  return (
    <div ref={navRef} style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: '#ffffff',
      borderTop: '1px solid rgba(0,0,0,0.08)',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* 純 CSS 的 :active 回饋：iOS LINE webview tap 後立刻看到縮放/變色，
          補上 next/router 路由切換之間那 100~300ms 的「按了沒反應」感。
          touch-action: manipulation 順便砍掉 iOS 預設 300ms tap delay。 */}
      <style>{`
        .liff-nav-tab {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: transform 120ms ease, opacity 120ms ease;
        }
        .liff-nav-tab:active {
          transform: scale(0.92);
          opacity: 0.65;
        }
      `}</style>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(({ path, label, Icon, isRoot }) => {
          const href = isRoot ? (base || '/') : `${base}/${path}`
          // 主頁：精確匹配根路徑；其他：前綴匹配
          const active = isRoot
            ? (pathname === href || pathname === base || pathname === `${base}/`)
            : (pathname === href || pathname.startsWith(href + '/'))
          return (
            <Link
              key={path}
              href={href}
              className="liff-nav-tab"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                paddingTop: 10,
                paddingBottom: 10,
                textDecoration: 'none',
              }}
            >
              <div style={active ? {
                width: 44, height: 28, borderRadius: 10,
                background: C.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#ffffff',
                transition: 'background 0.2s',
              } : {
                width: 44, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#4b5563',
              }}>
                <Icon size={active ? 18 : 20} />
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                color: active ? C.primary : '#4b5563',
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
