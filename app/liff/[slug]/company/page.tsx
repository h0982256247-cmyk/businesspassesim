'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'
import ConfirmDialog from '@/components/liff/ConfirmDialog'

type Membership = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  group: { id: string; name: string; description: string | null; isActive: boolean }
} | null

export default function CompanyPage() {
  const base = useLiffBase()
  const C = useTenantColors()
  const [membership, setMembership] = useState<Membership>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const load = useCallback(async () => {
    const [g, adminOk] = await Promise.all([
      fetch('/api/groups').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/company-admin').then(r => r.ok).catch(() => false),
    ])
    setMembership(g?.membership ?? null)
    setIsAdmin(adminOk === true)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 由分享連結帶入邀請碼（?code=）→ 自動填入輸入框，員工點連結即可直接送出
  useEffect(() => {
    if (typeof window === 'undefined') return
    const c = new URLSearchParams(window.location.search).get('code')
    if (c) setCode(c.trim().toUpperCase())
  }, [])

  const join = async () => {
    if (!code.trim()) return
    setBusy(true); setMsg(null)
    const r = await fetch('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: code.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? '加入失敗'); return }
    setCode('')
    await load()
  }

  const leave = async () => {
    setConfirmLeave(false)
    setBusy(true)
    await fetch('/api/groups/leave', { method: 'POST' }).catch(() => {})
    setBusy(false)
    await load()
  }

  if (loading) return <PageSkeleton rows={4} />

  const m = membership

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px 96px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: S.ink, margin: '0 0 16px' }}>我的企業</h1>

      {m && m.status === 'APPROVED' ? (
        <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: S.ink, margin: 0 }}>{m.group.name}</p>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 100 }}>企業會員</span>
          </div>
          {m.group.description && <p style={{ fontSize: 13, color: S.muted, margin: '0 0 12px' }}>{m.group.description}</p>}
          <div style={{ background: C.soft, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: C.primaryText, margin: 0, fontWeight: 600 }}>✓ 購買 eSIM 享企業福利價</p>
          </div>
          {isAdmin && (
            <a
              href={`${base}/company-admin`}
              style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 10 }}
            >
              管理成員（審核 / 移除）
            </a>
          )}
          <button
            onClick={() => setConfirmLeave(true)}
            disabled={busy}
            style={{ width: '100%', padding: '11px', borderRadius: 12, background: 'transparent', border: `1px solid ${S.line}`, color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer' }}
          >
            退出企業
          </button>
        </div>
      ) : m && m.status === 'PENDING' ? (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#9a3412', margin: '0 0 4px' }}>加入申請審核中</p>
          <p style={{ fontSize: 13, color: '#c2410c', margin: 0 }}>企業「{m.group.name}」的管理員審核通過後，即可享福利價。</p>
        </div>
      ) : (
        <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: '0 0 4px' }}>加入企業</p>
          <p style={{ fontSize: 13, color: S.muted, margin: '0 0 14px' }}>輸入公司提供的邀請碼，審核通過後購買 eSIM 享福利價。</p>
          {m?.status === 'REJECTED' && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>先前的申請未通過，可重新輸入邀請碼申請。</p>}
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="邀請碼（如 A1B2C3D4）"
            maxLength={16}
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${S.line}`, fontSize: 15, letterSpacing: '0.05em', marginBottom: 10, outline: 'none' }}
          />
          {msg && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>{msg}</p>}
          <button
            onClick={join}
            disabled={busy || !code.trim()}
            style={{ width: '100%', padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, fontWeight: 700, fontSize: 14, border: 'none', cursor: busy || !code.trim() ? 'default' : 'pointer', opacity: busy || !code.trim() ? 0.6 : 1 }}
          >
            {busy ? '送出中…' : '送出加入申請'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="退出企業"
        lines={['退出後購買將恢復一般售價。']}
        confirmLabel="退出"
        tone="danger"
        colors={C}
        onConfirm={leave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  )
}
