'use client'

import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'
import ConfirmDialog from '@/components/liff/ConfirmDialog'
import { resizeToBlob } from '@/lib/utils/image'
import { useT } from '@/components/liff/LocaleProvider'

type Membership = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  group: { id: string; name: string; description: string | null; isActive: boolean }
} | null

export default function CompanyPage() {
  const base = useLiffBase()
  const C = useTenantColors()
  const { t } = useT()
  const [membership, setMembership] = useState<Membership>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
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

  // 釋放預覽用的 object URL（切換圖片時清舊的、離開頁面時清當前）
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setMsg(null)
    if (f && !f.type.startsWith('image/')) { setMsg(t.company.errNotImage); return }
    if (f && f.size > 15 * 1024 * 1024) { setMsg(t.company.errTooLarge); return }
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const join = async () => {
    if (!code.trim() || !file) return
    setBusy(true); setMsg(null)
    let r: Response
    try {
      const blob = await resizeToBlob(file, 1600, 0.85) // 名片/工作證要看清字，用較高解析
      const fd = new FormData()
      fd.append('inviteCode', code.trim())
      fd.append('file', blob, 'credential.jpg')
      r = await fetch('/api/groups/join', { method: 'POST', body: fd }) // 不設 Content-Type，讓瀏覽器帶 multipart boundary
    } catch {
      setBusy(false); setMsg(t.company.errImageFailed); return
    }
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? t.company.errJoinFailed); return }
    setCode('')
    setFile(null)
    setPreview(null)
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
      <h1 style={{ fontSize: 20, fontWeight: 800, color: S.ink, margin: '0 0 16px' }}>{t.company.title}</h1>

      {m && m.status === 'APPROVED' ? (
        <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: S.ink, margin: 0 }}>{m.group.name}</p>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 100 }}>{t.profile.memberBadge}</span>
          </div>
          {m.group.description && <p style={{ fontSize: 13, color: S.muted, margin: '0 0 12px' }}>{m.group.description}</p>}
          <div style={{ background: C.soft, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: C.primaryText, margin: 0, fontWeight: 600 }}>{t.company.benefit}</p>
          </div>
          {isAdmin && (
            <a
              href={`${base}/company-admin`}
              style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 10 }}
            >
              {t.company.manageMembers}
            </a>
          )}
          <button
            onClick={() => setConfirmLeave(true)}
            disabled={busy}
            style={{ width: '100%', padding: '11px', borderRadius: 12, background: 'transparent', border: `1px solid ${S.line}`, color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer' }}
          >
            {t.company.leave}
          </button>
        </div>
      ) : m && m.status === 'PENDING' ? (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#9a3412', margin: '0 0 4px' }}>{t.company.pendingTitle}</p>
          <p style={{ fontSize: 13, color: '#c2410c', margin: 0 }}>{t.company.pendingBody(m.group.name)}</p>
        </div>
      ) : (
        <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: '0 0 4px' }}>{t.company.joinTitle}</p>
          <p style={{ fontSize: 13, color: S.muted, margin: '0 0 14px' }}>{t.company.joinIntro}</p>
          {m?.status === 'REJECTED' && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>{t.company.rejectedNote}</p>}
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder={t.company.codePlaceholder}
            maxLength={16}
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${S.line}`, fontSize: 15, letterSpacing: '0.05em', marginBottom: 12, outline: 'none' }}
          />
          <label style={{ display: 'block', marginBottom: 4 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: S.ink, margin: '0 0 6px' }}>{t.company.credentialLabel}</span>
            <input type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
            {preview ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, border: `1px solid ${S.line}`, background: S.white, cursor: 'pointer' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt={t.company.previewAlt} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name}</span>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.primary }}>{t.company.reselect}</span>
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 12px', borderRadius: 12, border: `1.5px dashed ${S.line}`, background: C.soft, color: C.primaryText, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t.company.uploadCta}</span>
            )}
          </label>
          <p style={{ fontSize: 11, color: S.faint, margin: '0 0 12px' }}>{t.company.credentialHint}</p>
          {msg && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>{msg}</p>}
          <button
            onClick={join}
            disabled={busy || !code.trim() || !file}
            style={{ width: '100%', padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, fontWeight: 700, fontSize: 14, border: 'none', cursor: busy || !code.trim() || !file ? 'default' : 'pointer', opacity: busy || !code.trim() || !file ? 0.6 : 1 }}
          >
            {busy ? t.company.submitting : t.company.submitJoin}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title={t.company.leave}
        lines={[t.company.leaveConfirmLine]}
        confirmLabel={t.company.leaveConfirm}
        tone="danger"
        colors={C}
        onConfirm={leave}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  )
}
