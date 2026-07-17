'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import { CountryFlag } from '@/components/common/CountryFlag'

type GiftPreview = {
  status: 'PENDING' | 'CLAIMED' | 'CANCELLED' | 'EXPIRED'
  sharedAt: string
  expiresAt: string
  claimedAt: string | null
  fromUserId: string
  fromName: string
  product: {
    name: string
    countryCode: string | null
    countryFlag: string | null
    dataCapacity: string | null
    displayDays: number | null
  } | null
}

const S = {
  white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)',
} as const

export default function GiftClaimPage() {
  const router = useRouter()
  const base = useLiffBase()
  const { token } = useParams<{ token: string }>()
  const C = useTenantColors()
  const { isReady: liffReady, isLoggedIn } = useLiff()

  const [gift, setGift] = useState<GiftPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)

  // 是否需要先完成註冊（phone + email）
  const [profileChecked, setProfileChecked] = useState(false)
  const [profileComplete, setProfileComplete] = useState(false)

  // 先抓 gift 資料（不需登入也可預覽）
  useEffect(() => {
    fetch(`/api/gifts/${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setGift(d) })
      .finally(() => setLoading(false))
  }, [token])

  // LIFF 登入完成後檢查 profile
  useEffect(() => {
    if (!liffReady || !isLoggedIn) return
    fetch('/api/users/me')
      .then(r => r.json())
      .then(d => {
        const u = d.user
        const ok = !!(u?.phone && u?.email)
        setProfileComplete(ok)
      })
      .finally(() => setProfileChecked(true))
  }, [liffReady, isLoggedIn])

  const handleClaim = async () => {
    setClaiming(true)
    const r = await fetch(`/api/gifts/${token}/claim`, { method: 'POST' }).then(x => x.json())
    setClaiming(false)
    if (r.ok) {
      // 領取成功 → 導至 /orders/[id] 看 QR
      router.replace(`${base}/orders/${r.orderId}`)
      return
    }
    if (r.needsRegistration) {
      setProfileComplete(false)
      return
    }
    alert(r.error ?? '領取失敗')
  }

  if (loading || !liffReady || (isLoggedIn && !profileChecked)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ width: 28, height: 28, border: `2.5px solid ${C.light}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (error || !gift) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔗</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: S.ink, margin: '0 0 8px' }}>無效的分享連結</h1>
        <p style={{ fontSize: 13, color: S.faint, margin: 0 }}>{error ?? '此連結不存在或已失效'}</p>
      </div>
    )
  }

  // 終止狀態
  const terminalMessage =
    gift.status === 'CLAIMED'   ? '此 eSIM 已被他人領取' :
    gift.status === 'EXPIRED'   ? '此分享連結已過期'   :
    gift.status === 'CANCELLED' ? '此分享已被取消'     : null

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 96px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🎁</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          {gift.fromName} 送了你一張 eSIM
        </h1>
        <p style={{ fontSize: 13, color: S.faint, margin: 0 }}>領取後即可開始使用</p>
      </div>

      {/* eSIM 卡片預覽（不揭露 QR） */}
      <div style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 16 }}>
        {(gift.product?.countryCode || gift.product?.countryFlag) && (
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <CountryFlag code={gift.product?.countryCode} fallbackEmoji={gift.product?.countryFlag} size={64} />
          </div>
        )}
        <p style={{ fontSize: 17, fontWeight: 800, color: S.ink, textAlign: 'center', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          {gift.product?.name ?? 'eSIM'}
        </p>
        {(gift.product?.displayDays || gift.product?.dataCapacity) && (
          <p style={{ fontSize: 13, color: S.muted, textAlign: 'center', margin: 0 }}>
            {gift.product?.displayDays && `${gift.product.displayDays} 天`}
            {gift.product?.displayDays && gift.product?.dataCapacity && ' · '}
            {gift.product?.dataCapacity}
          </p>
        )}
      </div>

      {terminalMessage ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c', margin: 0 }}>{terminalMessage}</p>
        </div>
      ) : !isLoggedIn ? (
        <button
          onClick={() => location.reload()}  // LiffProvider 會自動呼叫 liff.login()
          style={{
            width: '100%', background: C.primary, color: C.onPrimary,
            border: 'none', borderRadius: 100, padding: '15px',
            fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}
        >
          使用 LINE 登入領取
        </button>
      ) : !profileComplete ? (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#c2410c', margin: '0 0 6px' }}>請先完成註冊</p>
          <p style={{ fontSize: 12, color: '#9a3412', margin: '0 0 12px', lineHeight: 1.6 }}>
            領取 eSIM 前需要完成手機與 Email 註冊，這也是收取 eSIM 啟動通知的方式。
          </p>
          <button
            onClick={() => router.push(`${base}/profile/setup?returnTo=${encodeURIComponent(`${base}/gift/${token}`)}`)}
            style={{
              width: '100%', background: '#c2410c', color: '#fff',
              border: 'none', borderRadius: 10, padding: '12px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            前往註冊
          </button>
        </div>
      ) : (
        <button
          onClick={handleClaim}
          disabled={claiming}
          style={{
            width: '100%', background: C.primary, color: C.onPrimary,
            border: 'none', borderRadius: 100, padding: '15px',
            fontSize: 15, fontWeight: 800, cursor: claiming ? 'wait' : 'pointer',
            opacity: claiming ? 0.7 : 1,
          }}
        >
          {claiming ? '領取中…' : '✓ 接受轉贈'}
        </button>
      )}

      <p style={{ fontSize: 11, color: S.faint, textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
        分享於 {new Date(gift.sharedAt).toLocaleDateString('zh-TW')}
        {' · '}
        於 {new Date(gift.expiresAt).toLocaleDateString('zh-TW')} 到期
      </p>
    </div>
  )
}
