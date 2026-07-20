'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'

type Gift = {
  fromName: string
  productName: string
  dataCapacity: string | null
  state: 'claimable' | 'claimed' | 'cancelled' | 'expired' | 'unavailable'
  isMine: boolean
  claimedByMe: boolean
} | null

const S = { white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8' } as const

export default function GiftClaimPage() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const { token } = useParams<{ token: string }>()
  const [gift, setGift] = useState<Gift>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/gift/${token}`)
    if (r.status === 404) { setNotFound(true); setLoading(false); return }
    const d = await r.json().catch(() => null)
    setGift(d)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const claim = async () => {
    setBusy(true); setError(null)
    const r = await fetch(`/api/gift/${token}/claim`, { method: 'POST' }).then(x => x.json()).catch(() => ({ error: '連線失敗' }))
    setBusy(false)
    if (r.error) { setError(r.error); return }
    // 領取成功 → 導去「我的 eSIM」
    router.replace(`${base}/orders`)
  }

  if (loading) return <PageSkeleton rows={3} />

  const card = (title: string, desc: string, tone: 'ok' | 'warn' = 'warn') => (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 30 }}>{tone === 'ok' ? '✅' : '🎁'}</span>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: S.ink, margin: '0 0 8px' }}>{title}</h1>
      <p style={{ fontSize: 14, color: S.muted, lineHeight: 1.6, margin: '0 0 24px' }}>{desc}</p>
      <button onClick={() => router.replace(`${base}/orders`)}
        style={{ background: C.primary, color: C.onPrimary, border: 'none', borderRadius: 100, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        前往我的 eSIM
      </button>
    </div>
  )

  if (notFound || !gift) return card('轉贈連結無效', '這個連結可能不存在或已失效。')
  if (gift.isMine) return card('這是你送出的轉贈', '無法領取自己送出的 eSIM。可回訂單頁取消或重新分享。')
  if (gift.claimedByMe) return card('你已領取這張 eSIM', '可在「我的 eSIM」查看並安裝。', 'ok')
  if (gift.state === 'claimed') return card('這張 eSIM 已被領取', '這個轉贈已由他人領取。')
  if (gift.state === 'cancelled') return card('轉贈已取消', '對方已取消這次轉贈。')
  if (gift.state === 'expired') return card('轉贈連結已過期', '請對方重新分享一次。')
  if (gift.state === 'unavailable') return card('這張 eSIM 已無法領取', '對方可能已自行安裝。')

  // claimable
  const planLabel = gift.dataCapacity && !gift.productName.includes(gift.dataCapacity)
    ? `${gift.productName} · ${gift.dataCapacity}` : gift.productName
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🎁</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 6px' }}>你收到一張 eSIM</h1>
        <p style={{ fontSize: 14, color: S.muted, margin: 0 }}>由 <b>{gift.fromName}</b> 轉贈給你</p>
      </div>
      <div style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: C.primaryText, margin: 0 }}>{planLabel}</p>
        <p style={{ fontSize: 12, color: S.muted, margin: '6px 0 0' }}>領取後這張 eSIM 由你安裝使用，對方將無法再使用。</p>
      </div>
      {error && <p style={{ fontSize: 13, color: '#dc2626', textAlign: 'center', margin: '0 0 14px' }}>{error}</p>}
      <button onClick={claim} disabled={busy}
        style={{ width: '100%', background: C.primary, color: C.onPrimary, border: 'none', borderRadius: 100, padding: '15px', fontSize: 16, fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? '領取中…' : '領取這張 eSIM'}
      </button>
    </div>
  )
}
