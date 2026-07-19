'use client'

import { useCallback, useEffect, useState, type ReactNode, type CSSProperties } from 'react'
import { useTenantColors, type TenantColors } from '@/components/liff/TenantContext'
import { useLiff } from '@/components/liff/LiffProvider'
import { useLiffBase } from '@/hooks/useLiffBase'
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
  const { liff } = useLiff()
  const base = useLiffBase()
  const [data, setData] = useState<Managed>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 一鍵分享邀請碼：LINE 內用 shareTargetPicker 傳 Flex（含邀請碼 + 一鍵加入連結，
  // 連結帶 ?code= 到「加入企業」頁自動預填）；不支援時退回複製邀請碼。
  const shareInvite = async () => {
    if (!data) return
    const code = data.company.inviteCode
    const companyName = data.company.name
    const fullUrl = `${window.location.origin}${base}/company?code=${encodeURIComponent(code)}`
    let joinLink = fullUrl
    try { if (liff?.permanentLink?.createUrlBy) joinLink = await liff.permanentLink.createUrlBy(fullUrl) } catch {}

    if (!liff || !liff.isApiAvailable('shareTargetPicker')) {
      try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
      return
    }
    const flex = {
      type: 'flex' as const,
      altText: `邀請你加入「${companyName}」，邀請碼 ${code}`,
      contents: {
        type: 'bubble' as const,
        body: {
          type: 'box' as const, layout: 'vertical' as const, spacing: 'md',
          contents: [
            { type: 'text' as const, text: `邀請你加入「${companyName}」`, weight: 'bold' as const, size: 'lg' as const, color: '#1a1a1a', wrap: true },
            { type: 'text' as const, text: '加入企業方案，購買 eSIM 享企業福利價', size: 'sm' as const, color: '#475569', wrap: true },
            { type: 'box' as const, layout: 'vertical' as const, margin: 'md' as const, backgroundColor: '#F1F5FF', cornerRadius: '10px', paddingAll: '12px', spacing: 'xs' as const,
              contents: [
                { type: 'text' as const, text: '邀請碼', size: 'xs' as const, color: '#64748b' },
                { type: 'text' as const, text: code, weight: 'bold' as const, size: 'xxl' as const, color: '#1a1a1a' },
              ] },
            { type: 'text' as const, text: '點下方按鈕加入，或到 App「我的企業」輸入邀請碼', size: 'xs' as const, color: '#94a3b8', wrap: true, margin: 'sm' as const },
          ],
        },
        footer: {
          type: 'box' as const, layout: 'vertical' as const,
          contents: [
            { type: 'button' as const, style: 'primary' as const, color: C.primary,
              action: { type: 'uri' as const, label: '點我加入', uri: joinLink } },
          ],
        },
      },
    }
    try { await liff.shareTargetPicker([flex]) } catch {}
  }

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
      <div style={{ background: C.soft, borderRadius: 12, padding: '10px 14px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        <p style={{ fontSize: 12, color: C.primaryText, margin: 0, flex: 1 }}>
          邀請碼：<b style={{ letterSpacing: '0.08em', fontSize: 14 }}>{data.company.inviteCode}</b>
        </p>
        <button onClick={shareInvite}
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 16px', borderRadius: 100, background: C.primary, color: C.onPrimary, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {copied ? '已複製' : '分享給員工'}
        </button>
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
