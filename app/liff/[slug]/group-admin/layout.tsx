'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'

// 線性 icon（取代原本 emoji，與顧客端視覺一致）
function TabIcon({ name, color }: { name: string; color: string }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'dash':     return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    case 'orders':   return <svg {...p}><path d="M9 12h6m-6 4h6M7 21h10a2 2 0 002-2V8l-5-5H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
    case 'revenue':  return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="12" cy="14.5" r="1.6" /></svg>
    case 'coupon':   return <svg {...p}><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4z" /><path d="M14 6.5v11" strokeDasharray="2 2.5" /></svg>
    case 'settings': return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
    default: return null
  }
}

// TAB sub-path 只存子路徑（空字串代表 /group-admin 根），render 時拼 base 出來
// 才會帶到正確的 /liff/<slug>/group-admin/<sub>，多租戶下每家走自己的 base。
const TABS: { sub: string; label: string; icon: string }[] = [
  { sub: '',          label: '總覽', icon: 'dash' },
  { sub: '/orders',   label: '訂單', icon: 'orders' },
  { sub: '/revenue',  label: '收益', icon: 'revenue' },
  { sub: '/coupons',  label: '發券', icon: 'coupon' },
  { sub: '/settings', label: '設定', icon: 'settings' },
]

export default function GroupAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const base = useLiffBase()
  const C = useTenantColors()
  const adminRoot = `${base}/group-admin`
  const inactive = '#9ca3af'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto">
        <div className="bg-white border-b px-4 py-3 flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: C.primaryText }}>社群主後台</span>
        </div>
        <div className="pb-20">{children}</div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-lg mx-auto flex">
          {TABS.map(t => {
            const href = `${adminRoot}${t.sub}`
            const active = t.sub === ''
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`)
            const color = active ? C.primary : inactive
            return (
              <Link
                key={t.sub || 'root'}
                href={href}
                className="flex-1 flex flex-col items-center py-2 text-xs relative transition"
                style={{ color }}
              >
                {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ background: C.primary }} />}
                <TabIcon name={t.icon} color={color} />
                <span className="mt-0.5">{t.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
