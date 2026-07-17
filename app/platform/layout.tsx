'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

type AdminInfo = {
  id: string
  name: string
  email: string
  role: string
  tenantAdminId:    string | null
  impersonatorId:   string | null
  impersonatorName: string | null
}

const NAV_ALL = [
  {
    href: '/platform',
    label: '儀表板',
    group: '總覽',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/platform/users',
    label: '會員管理',
    group: '營運',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5" />
        <circle cx="12" cy="8" r="4" />
      </svg>
    ),
  },
  {
    href: '/platform/groups',
    label: '社群管理',
    group: '營運',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-3-3h-2M9 20H4v-2a3 3 0 013-3h2m4-4a4 4 0 10-8 0 4 4 0 008 0zm6 0a3 3 0 10-6 0 3 3 0 006 0z" />
      </svg>
    ),
  },
  {
    href: '/platform/products',
    label: '商品管理',
    group: '商品與前台',
    roles: ['PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0v10l-8 4m-8-4V7m16 0l-8 4m-8-4l8 4" />
      </svg>
    ),
  },
  {
    href: '/platform/liff',
    label: 'LIFF 前台',
    group: '商品與前台',
    roles: ['PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    ),
  },
  {
    href: '/platform/orders',
    label: '訂單管理',
    group: '營運',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/platform/commissions',
    label: '分潤管理',
    group: '財務',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </svg>
    ),
  },
  {
    href: '/platform/withdrawals',
    label: '提領審核',
    group: '財務',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUB_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    href: '/platform/finance',
    label: '財務總覽',
    group: '財務',
    roles: ['SUPER_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: '/platform/admins',
    label: '帳號管理',
    group: '系統',
    roles: ['SUPER_ADMIN', 'PLATFORM_ADMIN'],
    icon: (
      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
]

// 側邊選單分組順序：依使用頻率由上而下（系統設定殿後、以分隔線隔開）。
const GROUP_ORDER = ['總覽', '營運', '商品與前台', '財務', '系統']

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  PLATFORM_ADMIN: 'Platform Admin',
  SUB_ADMIN: 'Sub Admin',
}

function getInitials(name: string) {
  return name.split('').slice(0, 2).join('').toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
]

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [notif, setNotif] = useState<{ items: { key: string; label: string; count: number; href: string }[]; total: number }>({ items: [], total: 0 })
  const [notifOpen, setNotifOpen] = useState(false)

  // 頂欄搜尋：像訂單編號（含「-」或 ESM/ORD 開頭）→ 訂單管理；否則 → 會員管理（依暱稱）。
  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const term = searchQ.trim().replace(/^#/, '')
    if (!term) return
    const looksLikeOrder = term.includes('-') || /^(esm|ord)/i.test(term)
    router.push(looksLikeOrder
      ? `/platform/orders?q=${encodeURIComponent(term)}`
      : `/platform/users?q=${encodeURIComponent(term)}&page=1`)
  }

  useEffect(() => {
    if (pathname === '/platform/login') return
    fetch('/api/platform/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { router.replace('/platform/login'); return }
        setAdmin(d.admin)
      })
      .catch(() => router.replace('/platform/login'))
  }, [pathname, router])

  // 通知鈴：每次切頁重抓待辦計數（輕量 count），佇列清空後紅點即消失
  useEffect(() => {
    if (pathname === '/platform/login') return
    fetch('/api/platform/notifications')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) setNotif(d) })
      .catch(() => {})
  }, [pathname])

  if (pathname === '/platform/login') return <>{children}</>

  const handleLogout = async () => {
    await fetch('/api/platform/auth/logout', { method: 'POST' })
    router.replace('/platform/login')
  }

  const handleImpersonateBack = async () => {
    await fetch('/api/platform/auth/impersonate-back', { method: 'POST' })
    router.replace('/platform/admins')
    router.refresh()
  }

  const nav = admin ? NAV_ALL.filter(n => n.roles.includes(admin.role)) : []
  const avatarColor = admin ? AVATAR_COLORS[admin.name.charCodeAt(0) % AVATAR_COLORS.length] : 'bg-blue-500'

  // Current page label for header
  const currentNav = NAV_ALL.find(n => n.href === pathname || (n.href !== '/platform' && pathname.startsWith(n.href)))
  const pageLabel = currentNav?.label ?? '儀表板'

  return (
    <div className="min-h-screen flex bg-[#f5f6fa]">
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <aside className="w-56 bg-white border-r border-gray-100 flex-shrink-0 flex flex-col shadow-sm">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-200">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800 leading-tight">eSIM Platform</p>
              <p className="text-[10px] text-gray-400">Enterprise Admin</p>
            </div>
          </div>
        </div>

        {/* Nav：依 GROUP_ORDER 分群，群前加小標；「系統」以分隔線隔開 */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {GROUP_ORDER.map(group => {
            const items = nav.filter(n => n.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} className={group === '系統' ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
                <p className="px-4 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{group}</p>
                {items.map(n => {
                  const active = pathname === n.href || (n.href !== '/platform' && pathname.startsWith(n.href))
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`flex items-center gap-3 mx-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                        active
                          ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-200'
                          : 'text-gray-500 hover:bg-blue-50/60 hover:text-blue-600'
                      }`}
                    >
                      <span className={active ? 'text-white' : 'text-gray-400'}>{n.icon}</span>
                      {n.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-gray-100">
          {admin && (
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center flex-shrink-0`}>
                <span className="text-white text-xs font-bold">{getInitials(admin.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{admin.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{ROLE_LABEL[admin.role] ?? admin.role}</p>
              </div>
              <button
                onClick={handleLogout}
                title="登出"
                className="text-gray-300 hover:text-red-400 transition flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-100 px-6 py-3.5 flex items-center gap-4 shadow-sm">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800">{pageLabel}</h2>
          </div>
          {/* Search */}
          <form onSubmit={onSearch} className="relative hidden sm:block">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="搜尋訂單編號、會員…"
              className="pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl w-56 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
          </form>
          {/* 通知鈴：待辦佇列計數，紅點只在有待辦時亮 */}
          <div className="relative">
            <button onClick={() => setNotifOpen(o => !o)} className="relative p-2 rounded-xl hover:bg-gray-50 transition text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notif.total > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">待辦通知</p>
                    {notif.total > 0
                      ? <span className="text-xs font-medium text-red-500">{notif.total} 項待處理</span>
                      : <span className="text-xs text-gray-400">目前無待辦</span>}
                  </div>
                  <div className="py-1">
                    {notif.items.map(it => (
                      <button key={it.key} onClick={() => { setNotifOpen(false); router.push(it.href) }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition text-left">
                        <span className="text-sm text-gray-600">{it.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${it.count > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>{it.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {/* User avatar */}
          {admin && (
            <div className="flex items-center gap-2 pl-2 border-l border-gray-100">
              <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center`}>
                <span className="text-white text-xs font-bold">{getInitials(admin.name)}</span>
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold text-gray-700 leading-tight">{admin.name}</p>
                <p className="text-[10px] text-gray-400">{ROLE_LABEL[admin.role] ?? admin.role}</p>
              </div>
            </div>
          )}
        </header>

        {/* ── Impersonation Banner ── */}
        {admin?.impersonatorId && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-sm text-amber-800">
                您正以 <strong>{admin.name}</strong> 的身份瀏覽平台商後台
                <span className="text-amber-500 mx-1.5">·</span>
                切換者：{admin.impersonatorName}
              </span>
            </div>
            <button
              onClick={handleImpersonateBack}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg px-3 py-1.5 transition flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回 Super Admin 後台
            </button>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
