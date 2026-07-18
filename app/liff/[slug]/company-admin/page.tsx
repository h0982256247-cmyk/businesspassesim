'use client'

import { useCallback, useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useTenantColors, type TenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'

type Member = {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  joinedAt: string
  user: { id: string; displayName: string; avatarUrl: string | null }
}
type Managed = {
  company: { id: string; name: string; inviteCode: string; isActive: boolean }
  members: Member[]
} | null

const S = { white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8', line: 'rgba(0,0,0,0.07)' } as const

function btn(bg: string, color: string, border?: string): CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 10, background: bg, color,
    border: border ? `1px solid ${border}` : 'none',
    fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

function SectionTitle({ title }: { title: string }) {
  return <p style={{ fontSize: 13, fontWeight: 700, color: S.muted, margin: '0 0 10px' }}>{title}</p>
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: S.faint, margin: '0 0 8px', padding: '14px 0' }}>{text}</p>
}

function MemberRow({ m, children }: { m: Member; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: S.white, border: `1px solid ${S.line}`, borderRadius: 14, padding: '12px 14px', marginBottom: 8 }}>
      {m.user.avatarUrl
        ? <img src={m.user.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: S.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.user.displayName}</p>
        <p style={{ fontSize: 11, color: S.faint, margin: '2px 0 0' }}>申請於 {new Date(m.joinedAt).toLocaleDateString('zh-TW')}</p>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

export default function CompanyAdminPage() {
  const C: TenantColors = useTenantColors()
  const [data, setData] = useState<Managed>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/company-admin')
    if (r.status === 403) { setForbidden(true); setLoading(false); return }
    const d = await r.json().catch(() => null)
    setData(d)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (userId: string, action: 'approve' | 'reject' | 'remove') => {
    setBusyId(userId)
    if (action === 'remove') {
      if (!window.confirm('確定移除此成員？移除後對方將恢復一般售價。')) { setBusyId(null); return }
      await fetch(`/api/company-admin/members/${userId}`, { method: 'DELETE' }).catch(() => {})
    } else {
      await fetch(`/api/company-admin/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).catch(() => {})
    }
    setBusyId(null)
    await load()
  }

  if (loading) return <PageSkeleton rows={5} />
  if (forbidden || !data) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: S.muted }}>你不是任何企業的管理員。</p>
      </div>
    )
  }

  const pending = data.members.filter(m => m.status === 'PENDING')
  const approved = data.members.filter(m => m.status === 'APPROVED')

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px 96px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: S.ink, margin: '0 0 4px' }}>{data.company.name}</h1>
      <p style={{ fontSize: 13, color: S.muted, margin: '0 0 10px' }}>成員管理</p>
      <div style={{ background: C.soft, borderRadius: 12, padding: '10px 14px', marginBottom: 22 }}>
        <p style={{ fontSize: 12, color: C.primaryText, margin: 0 }}>
          邀請碼：<b style={{ letterSpacing: '0.08em' }}>{data.company.inviteCode}</b>（分享給員工加入）
        </p>
      </div>

      <SectionTitle title={`待審核（${pending.length}）`} />
      {pending.length === 0 ? <Empty text="目前沒有待審核的申請" /> : pending.map(m => (
        <MemberRow key={m.id} m={m}>
          <button onClick={() => act(m.user.id, 'approve')} disabled={busyId === m.user.id} style={btn(C.primary, C.onPrimary)}>核准</button>
          <button onClick={() => act(m.user.id, 'reject')} disabled={busyId === m.user.id} style={btn('transparent', '#dc2626', '#fecaca')}>拒絕</button>
        </MemberRow>
      ))}

      <div style={{ marginTop: 24 }}>
        <SectionTitle title={`已核准成員（${approved.length}）`} />
        {approved.length === 0 ? <Empty text="尚無已核准成員" /> : approved.map(m => (
          <MemberRow key={m.id} m={m}>
            <button onClick={() => act(m.user.id, 'remove')} disabled={busyId === m.user.id} style={btn('transparent', '#dc2626', '#fecaca')}>移除</button>
          </MemberRow>
        ))}
      </div>
    </div>
  )
}
