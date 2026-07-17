'use client'

import { useRouter } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import { useCachedData } from '@/hooks/useCachedData'
import PageSkeleton from '@/components/liff/PageSkeleton'

type UserInfo = {
  id: string
  displayName: string
  avatarUrl: string | null
  profileComplete: boolean
  ownedGroup?: { status: string; name: string } | null
  membership?: { group: { name: string } } | null
}

const S = {
  white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)',
} as const

function ChevronRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={S.faint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconGroup() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconSupport() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={S.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()

  const { data, loading } = useCachedData('profile', async () => {
    const d = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
    if (!d?.user) return { user: null as UserInfo | null }
    // /api/auth/me 回傳的會員社群欄位叫 `group`（非 membership）；包成 { group } 對應 UI。
    return { user: { ...d.user, ownedGroup: d.ownedGroup ?? null, membership: d.group ? { group: d.group } : null } as UserInfo }
  })
  const user = data?.user ?? null

  if (loading) return <PageSkeleton rows={4} />
  if (!user) return null

  const isGroupOwner = user.ownedGroup?.status === 'APPROVED'
  const isMember = !!user.membership && !isGroupOwner

  const groupLabel = isGroupOwner
    ? `社群主 · ${user.ownedGroup!.name}`
    : isMember
    ? `會員 · ${user.membership!.group.name}`
    : '尚未加入社群'

  const menuItems = [
    { label: '個人資料', sub: '姓名、電話、電郵', icon: <IconEdit />, href: `${base}/profile/setup` },
    { label: '我的社群', sub: groupLabel,           icon: <IconGroup />, href: `${base}/group` },
    { label: '客服中心', sub: '問題回報與聯絡',    icon: <IconSupport />, href: `${base}/support` },
  ]

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px 96px' }}>

      {/* Identity block */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${S.line}` }} />
          : (
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: C.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.primaryText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )
        }
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: S.ink, margin: 0 }}>{user.displayName}</p>
            {isGroupOwner && (
              <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 100 }}>
                社群主
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: S.faint, marginTop: 3 }}>{groupLabel}</p>
        </div>
      </div>

      {/* Incomplete profile warning */}
      {!user.profileComplete && (
        <button
          onClick={() => router.push(`${base}/profile/setup`)}
          style={{
            width: '100%', marginBottom: 14,
            background: '#fff7ed', border: '1px solid #fed7aa',
            borderRadius: 14, padding: '13px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#9a3412', margin: 0 }}>個人資料未填寫</p>
            <p style={{ fontSize: 12, color: '#c2410c', margin: 0 }}>填寫後才能完成結帳</p>
          </div>
          <ChevronRight />
        </button>
      )}

      {/* Settings menu */}
      <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {menuItems.map((item, i) => (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14,
              padding: '15px 16px', background: 'transparent', border: 'none',
              borderTop: i > 0 ? `1px solid ${S.line}` : 'none',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: S.ink, margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: 12, color: S.faint, marginTop: 2 }}>{item.sub}</p>
            </div>
            <ChevronRight />
          </button>
        ))}
      </div>
    </div>
  )
}
