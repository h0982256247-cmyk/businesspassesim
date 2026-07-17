'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors, useTenant } from '@/components/liff/TenantContext'
import { deriveEsimStatus, daysLeftOf, TONE_STYLE } from '@/lib/esimStatus'
import { IconSim, IconInstall, IconShare, IconCheck, IconClock, IconAlert } from '@/components/liff/EsimIcons'
import ConfirmDialog from '@/components/liff/ConfirmDialog'
import Toast from '@/components/liff/Toast'
import { GiftIcon } from '@/components/liff/GiftIcon'
import type { ReactNode } from 'react'

type GiftInfo = {
  token: string
  sharedAt: string
  expiresAt: string
  claimedAt: string | null
  cancelledAt: string | null
  recipientName: string | null
  toUser: { displayName: string } | null
  fromUser: { displayName: string } | null
}

type OrderDetail = {
  id: string
  orderNumber: string | null
  status: string
  totalPaid: number
  subtotal: number
  discountAmount: number
  paymentMethod: string
  paidAt: string | null
  createdAt: string
  userId: string
  currentOwnerId: string
  bundleId: string | null
  failureReason: string | null
  cancelReason: string | null
  esimRcode: string | null
  esimQrcode: string | null
  esimLpa: string | null
  esimIccid: string | null
  activationStart: string | null
  activationEnd: string | null
  redeemedAt: string | null
  activatedAt: string | null
  orderItems: { productName: string; qty: number; unitPrice: number; product?: { dataCapacity: string | null } | null }[]
  gift: GiftInfo | null
}

type EsimUsage = {
  iccid: string
  totalData: number
  usedData: number
  remainingData: number
  unit: string
}

const S = {
  white: '#ffffff', ink: '#1a1a1a', muted: '#4b5563', faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)',
} as const

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ background: '#f1f5f9', borderRadius: 100, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 100, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function formatData(mb: number, unit: string): string {
  if (unit === 'GB' || mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toLocaleString()} MB`
}

// 偵測 iOS 17.4+（支援網頁一鍵安裝 eSIM）
function supportsOneClickEsim(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (!/iPhone|iPad|iPod/.test(ua)) return false
  // UA 內格式：iPhone OS 17_4 like ...
  const m = ua.match(/iPhone OS (\d+)[._](\d+)/)
  if (!m) return false
  const major = parseInt(m[1])
  const minor = parseInt(m[2])
  return major > 17 || (major === 17 && minor >= 4)
}

// 把 LPA 字串轉成 Apple 一鍵安裝 URL
function buildAppleOneClickUrl(lpa: string): string {
  return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`
}

// 折扣（0.85）→ 折數標籤（9 折 / 85 折 / 92 折）
function zheLabel(d: number): string {
  const n = Math.round(d * 100)
  return n % 10 === 0 ? `${n / 10} 折` : `${n} 折`
}

export default function OrderDetailPage() {
  const router = useRouter()
  const base = useLiffBase()
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const C = useTenantColors()
  const tenant = useTenant()
  const { liff } = useLiff()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [usage, setUsage] = useState<EsimUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemTimeout, setRedeemTimeout] = useState(false)
  const [canOneClick, setCanOneClick] = useState(false)
  const [repurchaseCoupon, setRepurchaseCoupon] = useState<{ discount: number } | null>(null)
  // 自訂確認彈窗（取代 window.confirm，避免 LINE 內建瀏覽器露出網址）
  const [dialog, setDialog] = useState<null | {
    title: string; lines: string[]; confirmLabel: string;
    tone?: 'primary' | 'danger'; icon?: ReactNode; onConfirm: () => void
  }>(null)
  // 輕量提示（取代 alert）
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' | 'info' } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => { setCanOneClick(supportsOneClickEsim()) }, [])

  // 從 TapPay (LINE Pay / 3DS) 跳轉回來時，網址會帶 ?status=<n>。
  // status=0 是付款成功（等 webhook fan-out），非零代表失敗或使用者取消。
  // 後者通常 webhook 也會送來標 FAILED，但 LINE Pay 取消有時延遲很久，
  // 訂單會一直卡 PROCESSING 看似「準備 eSIM 中」，使用者很困惑。
  // 直接在 mount 時偵測：若 status 非零、訂單還在 PROCESSING，立刻打
  // /cancel API 主動標記為已取消。若萬一 TapPay 之後仍回成功，webhook
  // 已有保護路徑 (order=CANCELLED → 觸發退款)。
  const autoCancelDoneRef = useRef(false)
  useEffect(() => {
    if (autoCancelDoneRef.current) return
    const statusParam = searchParams.get('status')
    if (statusParam == null) return
    autoCancelDoneRef.current = true
    if (statusParam === '0') return   // 付款成功的 redirect，交給 polling
    fetch(`/api/orders/${id}/cancel`, { method: 'POST' })
      .then(r => r.json())
      .catch(() => null)
      .then(() => fetch(`/api/orders/${id}`).then(r => r.json()))
      .then(d => { if (d?.order) setOrder(d.order) })
      .catch(() => null)
  }, [id, searchParams])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    let pollStart = 0   // polling 起始時間（判斷 QR timeout / 啟用輪詢上限）
    const POLLING_STATUSES = ['PROCESSING', 'PAID', 'ESIM_PENDING']
    const load = () =>
      fetch(`/api/orders/${id}`)
        .then(r => { if (r.status === 404) setNotFound(true); return r.json() })
        .then(d => {
          if (d.order) setOrder(d.order)
          setRepurchaseCoupon(d.repurchaseCoupon ?? null)
          const o = d.order
          // 需要 polling 的情境：
          //   A. 訂單處理中（PAID/ESIM_PENDING 還沒收 2.2 callback）
          //   B. 已按「我要安裝」但 QR 還沒到（等 3.2 callback）
          //   C. QR 已給、還沒啟用 → 等手機安裝後 WM 2.7 啟用 callback。
          //      使用者多半離開去手機設定，故輪詢上限 5 分鐘避免空轉；
          //      回到頁面另有 visibilitychange 重新檢查。
          const awaitingQr = o?.redeemedAt && !o?.esimQrcode && !o?.activatedAt
          const awaitingActivation = o?.esimQrcode && !o?.activatedAt
          const needsPolling =
            POLLING_STATUSES.includes(o?.status) ||
            awaitingQr ||
            (awaitingActivation && (pollStart === 0 || Date.now() - pollStart < 300_000))

          if (needsPolling) {
            if (!timer) {
              pollStart = Date.now()
              timer = setInterval(load, 3000)
            }
            // 兌換中超過 60 秒未拿到 QR → 顯示 timeout 提示但繼續 poll
            if (awaitingQr && Date.now() - pollStart > 60_000) {
              setRedeemTimeout(true)
            }
          } else {
            clearInterval(timer)
            timer = undefined as unknown as ReturnType<typeof setInterval>
            setRedeemTimeout(false)
          }
        })
        .finally(() => setLoading(false))
    load()
    // 從手機設定安裝完回到此頁時立即重查一次（可能已啟用 → 翻成使用中）
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id])

  const handleRedeem = () => {
    if (!order) return
    setDialog({
      title: '確定要安裝這張 eSIM 嗎？',
      lines: ['安裝後會立即產生 QR 碼並綁定這支手機，', '綁定後就無法再轉贈給別人。'],
      confirmLabel: '確定安裝',
      tone: 'primary',
      icon: <IconInstall size={24} />,
      onConfirm: () => { setDialog(null); doRedeem() },
    })
  }

  const doRedeem = async () => {
    if (!order) return
    setRedeeming(true)
    setRedeemError(null)
    setRedeemTimeout(false)
    const r = await fetch(`/api/orders/${order.id}/redeem`, { method: 'POST' }).then(x => x.json())
    setRedeeming(false)
    if (r.error) {
      setRedeemError(r.error)
      return
    }
    // 重新 fetch 一次拿到 redeemedAt（觸發 polling 等 QR）
    const fresh = await fetch(`/api/orders/${order.id}`).then(x => x.json())
    if (fresh.order) setOrder(fresh.order)
  }

  // 建立分享連結並開啟 LINE 的 shareTargetPicker
  const handleShare = () => {
    if (!order) return
    if (!liff || !liff.isLoggedIn()) {
      setToast({ message: '請先登入 LINE', tone: 'error' })
      return
    }
    if (!liff.isApiAvailable('shareTargetPicker')) {
      setToast({ message: '您的 LINE 版本不支援分享功能，請更新 LINE App', tone: 'error' })
      return
    }
    setDialog({
      title: '確定要轉贈這張 eSIM 嗎？',
      lines: ['轉贈後這張 eSIM 將由對方使用，', '你就無法自己安裝了。'],
      confirmLabel: '確定轉贈',
      tone: 'primary',
      icon: <IconShare size={22} />,
      onConfirm: () => { setDialog(null); doShare() },
    })
  }

  const doShare = async () => {
    if (!order || !liff) return
    setSharing(true)
    try {
      // 1. 建立 gift token
      const r = await fetch(`/api/orders/${order.id}/gift`, { method: 'POST' }).then(x => x.json())
      if (!r.ok) {
        setToast({ message: `分享失敗：${r.error}`, tone: 'error' })
        return
      }

      // 2. 把 /gift/<token> 轉成 LIFF 永久連結
      const giftPath = `${base}/gift/${r.token}`
      const fullUrl = `${window.location.origin}${giftPath}`
      let giftLink: string = fullUrl
      try {
        giftLink = await liff.permanentLink.createUrlBy(fullUrl)
      } catch {
        // 若無權限，fallback 直接用一般 URL
      }

      // 3. 開啟分享面板，秀 Flex Message
      const item = order.orderItems[0]
      const productName = item?.productName ?? 'eSIM'
      // 完整方案：國家 N天 + 流量（新訂單快照已含流量，舊訂單靠 join 補、避免重複）
      const cap = item?.product?.dataCapacity
      const planLabel = cap && !productName.includes(cap) ? `${productName} · ${cap}` : productName
      const brandName = tenant?.brandName ?? 'eSIM'
      const flexMessage = {
        type: 'flex' as const,
        altText: `你收到一張來自「${brandName}」的 eSIM：${planLabel}`,
        contents: {
          type: 'bubble' as const,
          body: {
            type: 'box' as const,
            layout: 'vertical' as const,
            spacing: 'md',
            contents: [
              {
                type: 'text' as const,
                text: `你收到一張來自「${brandName}」的 eSIM`,
                weight: 'bold' as const,
                size: 'lg' as const,
                color: '#1a1a1a',
                wrap: true,
              },
              {
                type: 'text' as const,
                text: planLabel,
                size: 'md' as const,
                weight: 'bold' as const,
                wrap: true,
                color: C.primaryText,
              },
              {
                type: 'text' as const,
                text: '點下方按鈕完成領取，即可開始使用',
                size: 'sm' as const,
                color: '#475569',
                wrap: true,
              },
              {
                type: 'separator' as const,
                margin: 'md' as const,
              },
              {
                type: 'text' as const,
                text: '⚠ 連結 7 天內有效，請盡快領取',
                size: 'xs' as const,
                color: '#94a3b8',
                wrap: true,
              },
            ],
          },
          footer: {
            type: 'box' as const,
            layout: 'vertical' as const,
            spacing: 'sm',
            contents: [
              {
                type: 'button' as const,
                style: 'primary' as const,
                color: C.primaryText,
                action: {
                  type: 'uri' as const,
                  label: '查看並接受 eSIM',
                  uri: giftLink,
                },
              },
            ],
          },
        },
      }

      const result = await liff.shareTargetPicker([flexMessage])
      if (result?.status === 'success') {
        // 4. 重新載入訂單以顯示 gift 狀態
        const fresh = await fetch(`/api/orders/${order.id}`).then(x => x.json())
        if (fresh.order) setOrder(fresh.order)
      }
      // status 'cancel' → 用戶取消，gift 已建立但沒人收到。下次點分享會 reuse 同一個 token。
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '分享失敗', tone: 'error' })
    } finally {
      setSharing(false)
    }
  }

  const handleCancelShare = () => {
    if (!order) return
    setDialog({
      title: '確定要取消分享嗎？',
      lines: ['取消後分享連結會失效，', '對方將無法再領取這張 eSIM。'],
      confirmLabel: '取消分享',
      tone: 'danger',
      onConfirm: () => { setDialog(null); doCancelShare() },
    })
  }

  const doCancelShare = async () => {
    if (!order) return
    setSharing(true)
    const r = await fetch(`/api/orders/${order.id}/gift`, { method: 'DELETE' }).then(x => x.json())
    setSharing(false)
    if (r.error) {
      setToast({ message: `取消失敗：${r.error}`, tone: 'error' })
      return
    }
    const fresh = await fetch(`/api/orders/${order.id}`).then(x => x.json())
    if (fresh.order) setOrder(fresh.order)
  }

  const fetchUsage = async () => {
    setUsageLoading(true)
    setUsageError(null)
    try {
      const res = await fetch(`/api/orders/${id}/usage`)
      const data = await res.json()
      if (data.usage) setUsage(data.usage)
      else setUsageError(data.error ?? '無法取得用量')
    } catch {
      setUsageError('查詢失敗，請稍後再試')
    } finally {
      setUsageLoading(false)
    }
  }

  // 開啟「已激活」的訂單時，自動查一次流量（免得使用者還要手動點「查詢流量」）
  const usageAutoRef = useRef(false)
  useEffect(() => {
    if (usageAutoRef.current) return
    if (order?.activatedAt && order?.esimIccid && order.status === 'COMPLETED') {
      usageAutoRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性開卡查詢，非渲染同步
      fetchUsage()
    }
  }, [order]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ width: 28, height: 28, border: `2.5px solid ${C.light}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (notFound || !order) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 12 }}>
      <p style={{ color: S.faint }}>訂單不存在</p>
      <button onClick={() => router.push(`${base}/orders`)} style={{ color: C.primaryText, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
        查看所有訂單
      </button>
    </div>
  )

  const sv = deriveEsimStatus(order)
  const sTone = TONE_STYLE[sv.tone]

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 96px' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => router.push(`${base}/orders`)} style={{ fontSize: 13, color: C.primaryText, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          所有訂單
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: 0, letterSpacing: '-0.02em' }}>訂單詳情</h1>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: sTone.bg, color: sTone.fg,
            padding: '3px 10px', borderRadius: 100,
          }}>
            {sv.label}
          </span>
        </div>
        <p style={{ fontSize: 12, color: S.faint, marginTop: 4 }}>{order.orderNumber ?? `#${order.id.slice(-8).toUpperCase()}`}</p>
      </div>

      {/* 結帳完成回饋：本筆已發出回購券（趁剛買完最有感）*/}
      {repurchaseCoupon && (order.status === 'PAID' || order.status === 'COMPLETED') && (
        <div style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flexShrink: 0 }}><GiftIcon size={28} color={C.primaryText} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: C.primaryText, margin: 0 }}>本筆已回饋 {zheLabel(repurchaseCoupon.discount)} 回購券</p>
            <p style={{ fontSize: 12, color: S.muted, margin: '2px 0 0' }}>下次購買即可使用，於「優惠券」查看</p>
          </div>
          <button onClick={() => router.push(`${base}/coupons`)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.primaryText, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 100, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>查看</button>
        </div>
      )}

      {/* === eSIM 階段一：未使用（已收到 rcode、未按我要安裝） === */}
      {order.status === 'COMPLETED' && order.esimRcode && !order.redeemedAt && !order.activatedAt && (() => {
        const gift = order.gift
        const isPendingGift = gift && !gift.claimedAt && !gift.cancelledAt && new Date(gift.expiresAt) > new Date()
        const isReceived = !!gift?.claimedAt   // 轉贈進來的卡（已領取）→ 不可再轉贈
        return (
          <div style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 12 }}>
            {isReceived && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, background: '#ede9fe', color: '#6d28d9', padding: '5px 12px', borderRadius: 100 }}>
                  <IconShare size={12} /> 由 {gift?.fromUser?.displayName ?? '朋友'} 轉贈給你
                </span>
              </div>
            )}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', border: `1px solid ${C.border}`, color: C.primaryText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <IconSim size={24} />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: S.ink, margin: '0 0 4px' }}>eSIM 已準備好</h2>
              <p style={{ fontSize: 13, color: S.muted, margin: 0, lineHeight: 1.6 }}>
                {isPendingGift
                  ? '已分享給朋友，等待對方領取。如要自己使用，請先取消分享。'
                  : isReceived
                    ? '這張是朋友轉贈給你的，安裝後即可使用、無法再轉贈'
                    : '可以選擇自己安裝，或分享給朋友使用'}
              </p>
            </div>

            {/* 分享中狀態 */}
            {isPendingGift && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 5 }}><IconClock size={13} /> 已分享，等待領取</p>
                <p style={{ fontSize: 11, color: '#9a3412', margin: '0 0 10px', lineHeight: 1.5 }}>
                  連結將於 {new Date(gift!.expiresAt).toLocaleDateString('zh-TW')} 過期
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleShare}
                    disabled={sharing}
                    style={{ flex: 1, background: '#fff', border: '1px solid #fdba74', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#c2410c', cursor: 'pointer' }}
                  >
                    再次分享
                  </button>
                  <button
                    onClick={handleCancelShare}
                    disabled={sharing}
                    style={{ flex: 1, background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#b91c1c', cursor: 'pointer' }}
                  >
                    取消分享
                  </button>
                </div>
              </div>
            )}

            {/* 我要安裝按鈕（pending gift 時隱藏，避免衝突） */}
            {!isPendingGift && (
              <>
                <button
                  onClick={handleRedeem}
                  disabled={redeeming}
                  style={{
                    width: '100%', background: C.primary, color: C.onPrimary,
                    border: 'none', borderRadius: 100, padding: '15px',
                    fontSize: 15, fontWeight: 800, cursor: redeeming ? 'wait' : 'pointer',
                    opacity: redeeming ? 0.7 : 1, letterSpacing: '0.02em', marginBottom: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {redeeming ? '處理中…' : <><IconInstall size={17} /> 我要安裝</>}
                </button>
                <p style={{ fontSize: 11, color: S.faint, textAlign: 'center', margin: '0 0 12px', lineHeight: 1.5 }}>
                  安裝後綁定此手機，將無法再轉贈
                </p>
              </>
            )}
            {redeemError && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 4, marginBottom: 10, textAlign: 'center' }}>{redeemError}</p>
            )}

            {/* 轉贈按鈕（沒 gift 時顯示） */}
            {!isPendingGift && !gift?.claimedAt && (
              <>
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  style={{
                    width: '100%', background: S.white,
                    border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px',
                    fontSize: 14, fontWeight: 700, color: C.primaryText,
                    cursor: sharing ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <IconShare size={16} /> 轉贈給朋友
                </button>
                <p style={{ fontSize: 11, color: S.faint, textAlign: 'center', margin: '8px 0 0', lineHeight: 1.5 }}>
                  透過 LINE 傳給朋友，對方領取後由對方使用
                </p>
              </>
            )}
          </div>
        )
      })()}

      {/* === eSIM 階段二：兌換中（已按我要安裝、QR 還沒到） === */}
      {order.redeemedAt && !order.esimQrcode && !order.activatedAt && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '20px', marginBottom: 12, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #fed7aa', borderTopColor: '#ea580c', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#c2410c', margin: '0 0 4px' }}>正在準備 QR 碼…</p>
          <p style={{ fontSize: 12, color: '#9a3412', margin: 0, lineHeight: 1.6 }}>
            通常 10 秒到 1 分鐘內完成，請稍候
          </p>
          {redeemTimeout && (
            <p style={{ fontSize: 11, color: '#9a3412', marginTop: 8, lineHeight: 1.5 }}>
              處理時間較長，可暫時離開頁面，完成後會收到 LINE 通知
            </p>
          )}
        </div>
      )}

      {/* === eSIM 階段三/四：QR 已生成（含已激活） === */}
      {order.status === 'COMPLETED' && order.esimRcode && order.esimQrcode && (
        <div style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: S.ink, margin: '0 0 14px' }}>安裝你的 eSIM</h2>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.esimQrcode} alt="eSIM QR Code" style={{ width: 200, height: 200, borderRadius: 12, background: '#fff', padding: 8 }} />
          </div>

          {/* iOS 17.4+ 一鍵安裝 */}
          {canOneClick && order.esimLpa && !order.activatedAt && (
            <a
              href={buildAppleOneClickUrl(order.esimLpa)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                textDecoration: 'none',
                background: C.primary, color: C.onPrimary,
                borderRadius: 100, padding: '13px',
                fontSize: 14, fontWeight: 800, marginBottom: 8, letterSpacing: '0.02em',
              }}
            >
              <IconInstall size={16} /> 一鍵安裝
            </a>
          )}
          {order.esimLpa && !order.activatedAt && (
            <p style={{ fontSize: 11, color: S.faint, textAlign: 'center', margin: '0 0 14px', lineHeight: 1.6 }}>
              iOS 17.4 以上版本推薦使用
              <br/>
              或長按上方 QR 碼也可直接安裝
            </p>
          )}

          {/* 安裝步驟指引（尚未啟用時顯示） */}
          {!order.activatedAt && (
            <div style={{ background: '#f8fafc', border: `1px solid ${S.line}`, borderRadius: 12, padding: '12px 14px', margin: '0 0 14px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: S.ink, margin: '0 0 8px' }}>安裝步驟</p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: S.muted, lineHeight: 1.8 }}>
                <li>用上方「一鍵安裝」或長按 QR 碼，把 eSIM 加入手機</li>
                <li>到手機<strong style={{ color: S.ink }}>設定 → 行動服務／行動網路</strong>，開啟此 eSIM 的「行動數據」與「數據漫遊」</li>
                <li>連上網路後，本頁會自動更新為 <strong style={{ color: '#047857' }}>使用中</strong></li>
              </ol>
            </div>
          )}

          {order.activationStart && order.activationEnd && (
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: S.muted, display: 'block', marginBottom: 2 }}>使用期間</span>
              <span style={{ color: S.ink, fontWeight: 600 }}>
                {new Date(order.activationStart).toLocaleDateString('zh-TW')} ～ {new Date(order.activationEnd).toLocaleDateString('zh-TW')}
              </span>
            </div>
          )}
          {/* 技術資料（啟動碼／LPA）一般用一鍵安裝或掃 QR 即可，預設收合避免畫面雜亂 */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 12, color: S.muted, cursor: 'pointer' }}>進階：手動安裝資料</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, marginTop: 10 }}>
              <div>
                <span style={{ color: S.muted, display: 'block', marginBottom: 2 }}>啟動碼</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: S.ink, wordBreak: 'break-all', fontWeight: 600 }}>{order.esimRcode}</span>
              </div>
              {order.esimLpa && (
                <div>
                  <span style={{ color: S.muted, display: 'block', marginBottom: 2 }}>LPA</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: S.ink, fontSize: 11, wordBreak: 'break-all' }}>{order.esimLpa}</span>
                </div>
              )}
            </div>
          </details>

          {/* 已激活提示（只有在 QR 已展示 + 已激活時出現在這個 block） */}
          {order.activatedAt && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
              {(() => {
                const dl = daysLeftOf(order.activationEnd)
                const expiring = dl !== null && dl >= 0 && dl <= 3
                const expired = dl !== null && dl < 0
                const box = expired
                  ? { bg: '#f8fafc', border: '#e2e8f0', fg: '#64748b', sub: '#94a3b8', title: '已結束', Icon: IconClock }
                  : expiring
                    ? { bg: '#fff7ed', border: '#fed7aa', fg: '#c2410c', sub: '#9a3412', title: '即將到期', Icon: IconAlert }
                    : { bg: '#f0fdf4', border: '#86efac', fg: '#15803d', sub: '#166534', title: '已激活使用中', Icon: IconCheck }
                const remain = dl === null ? null : dl < 0 ? '使用期間已過' : dl === 0 ? '今天到期' : `剩 ${dl} 天`
                return (
                  <div style={{ background: box.bg, border: `1px solid ${box.border}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: box.fg, margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}><box.Icon size={14} /> {box.title}</p>
                      {remain && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: box.fg }}>{remain}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: box.sub, margin: '4px 0 0', lineHeight: 1.5 }}>
                      已於 {new Date(order.activatedAt).toLocaleDateString('zh-TW')} 激活
                      {order.activationEnd ? ` · ${new Date(order.activationEnd).toLocaleDateString('zh-TW')} 到期` : ''}
                    </p>
                  </div>
                )
              })()}
            </div>
          )}

          {/* 流量使用狀況 */}
          {order.esimIccid && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: S.ink }}>流量使用狀況</span>
                <button
                  onClick={fetchUsage}
                  disabled={usageLoading}
                  style={{
                    fontSize: 12, color: C.primaryText,
                    background: usageLoading ? C.light : S.white,
                    border: `1px solid ${C.border}`, borderRadius: 100, padding: '5px 14px',
                    cursor: usageLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600,
                  }}
                >
                  {usageLoading ? (
                    <>
                      <span style={{ display: 'inline-block', width: 10, height: 10, border: `1.5px solid ${C.light}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      查詢中
                    </>
                  ) : '查詢流量'}
                </button>
              </div>

              {usageError && <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 8px' }}>{usageError}</p>}

              {usage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <UsageBar used={usage.usedData} total={usage.totalData} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: S.muted }}>已用 <strong style={{ color: S.ink }}>{formatData(usage.usedData, usage.unit)}</strong></span>
                    <span style={{ color: S.muted }}>剩餘 <strong style={{ color: '#16a34a' }}>{formatData(usage.remainingData, usage.unit)}</strong></span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: S.faint }}>總流量 {formatData(usage.totalData, usage.unit)}</span>
                    <span style={{ fontSize: 11, color: S.faint }}>ICCID: {usage.iccid.slice(-8)}</span>
                  </div>
                </div>
              ) : !usageError && (
                <p style={{ fontSize: 12, color: S.faint, margin: 0 }}>點擊「查詢流量」取得即時用量資料</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 已取消 */}
      {order.status === 'CANCELLED' && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '18px 20px', marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#475569', margin: '0 0 4px' }}>訂單已取消</p>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
            {order.cancelReason ?? '此訂單已取消，如需購買請重新下單。'}
          </p>
        </div>
      )}

      {/* 付款失敗（LINE Pay 取消、信用卡被拒、3DS 認證失敗等） */}
      {order.status === 'FAILED' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '18px 20px', marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c', margin: '0 0 6px' }}>
            付款未完成
          </p>
          <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 14px', lineHeight: 1.6 }}>
            {order.failureReason ?? '此訂單付款失敗，請重新下單再試一次。'}
          </p>
          <button
            onClick={() => router.push(`${base}/products`)}
            style={{
              width: '100%',
              padding: '12px 0',
              border: 'none',
              borderRadius: 12,
              background: C.primary,
              color: C.onPrimary,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            重新下單
          </button>
        </div>
      )}

      {/* 待付款（金流已送出、尚未收到 backend notify 之前） */}
      {order.status === 'PROCESSING' && (
        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 16, padding: '18px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 18, height: 18, border: '2.5px solid #fde68a', borderTopColor: '#d97706', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#a16207', margin: 0 }}>待付款</p>
          </div>
          <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 12px', lineHeight: 1.6 }}>
            正在等待銀行確認付款結果，通常在幾秒內完成。請勿關閉此頁面。
          </p>
          <p style={{ fontSize: 12, color: '#a16207', margin: 0, lineHeight: 1.6 }}>
            若您剛在 LINE Pay 或銀行頁面取消了付款，可
            <button
              onClick={() => setDialog({
                title: '確定要取消這筆訂單嗎？',
                lines: ['若你剛取消了付款，按確定可立即釋出此訂單，', '不必等候系統自動處理。'],
                confirmLabel: '取消訂單',
                tone: 'danger',
                onConfirm: async () => {
                  setDialog(null)
                  try {
                    const r = await fetch(`/api/orders/${order.id}/cancel`, { method: 'POST' }).then(x => x.json())
                    if (!r.ok) { setToast({ message: r.error ?? '取消失敗，請稍候再試', tone: 'error' }); return }
                    // 立即重抓一次訂單，UI 就會切到 CANCELLED banner
                    await fetch(`/api/orders/${order.id}`).then(r => r.json()).then(d => d.order && setOrder(d.order))
                  } catch {
                    setToast({ message: '網路錯誤，請稍候再試', tone: 'error' })
                  }
                },
              })}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: '#b45309', fontWeight: 700, fontSize: 12,
                textDecoration: 'underline', cursor: 'pointer',
              }}
            >
              按此標記訂單為已取消
            </button>
            。
          </p>
        </div>
      )}

      {/* eSIM 處理中 */}
      {(order.status === 'ESIM_PENDING' || order.status === 'PAID') && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '18px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#c2410c', margin: 0 }}>eSIM 啟動碼準備中</p>
          </div>
          <p style={{ fontSize: 13, color: '#ea580c', margin: 0, lineHeight: 1.6 }}>
            系統正在取得啟動碼，通常在幾分鐘內完成。若超過 30 分鐘仍未收到，請聯繫客服。
          </p>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
      )}

      {/* 訂單資訊 */}
      <div style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: '18px 20px', marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: S.ink, margin: '0 0 14px' }}>訂單資訊</p>
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: S.faint, margin: '0 0 4px' }}>商品</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: S.ink, margin: 0 }}>{order.orderItems[0]?.productName ?? '—'}</p>
        </div>
        <div style={{ borderTop: `1px solid ${S.line}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: S.muted }}>
            <span>商品原價</span><span>NT${order.subtotal.toLocaleString()}</span>
          </div>
          {order.discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#16a34a' }}>
              <span>優惠折扣{order.bundleId ? '（多張總額折扣分攤至本張）' : ''}</span><span>-NT${order.discountAmount.toLocaleString()}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, borderTop: `1px solid ${S.line}`, paddingTop: 12, marginTop: 2 }}>
            <span style={{ color: S.ink }}>實付金額</span>
            <span style={{ color: C.primaryText, letterSpacing: '-0.02em' }}>NT${order.totalPaid.toLocaleString()}</span>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${S.line}`, paddingTop: 12, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: S.faint }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>付款方式</span>
            <span>{order.paymentMethod === 'CREDIT_CARD' ? '信用卡' : 'LINE Pay'}</span>
          </div>
          {order.paidAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>付款時間</span>
              <span>{new Date(order.paidAt).toLocaleString('zh-TW')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>下單時間</span>
            <span>{new Date(order.createdAt).toLocaleString('zh-TW')}</span>
          </div>
        </div>
      </div>

      {/* 導頁：回首頁 / 查看我的 eSIM */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={() => router.push(`${base}`)}
          style={{ flex: 1, padding: '12px 0', border: `1px solid ${S.line}`, borderRadius: 12, background: S.white, color: S.muted, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          回首頁
        </button>
        <button onClick={() => router.push(`${base}/orders`)}
          style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 12, background: C.primary, color: C.onPrimary, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          查看我的 eSIM
        </button>
      </div>

      {/* 客服 */}
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button onClick={() => router.push(`${base}/support`)} style={{ fontSize: 13, color: S.faint, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          需要協助？聯絡客服
        </button>
      </div>
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title ?? ''}
        lines={dialog?.lines}
        confirmLabel={dialog?.confirmLabel ?? '確定'}
        tone={dialog?.tone}
        icon={dialog?.icon}
        colors={C}
        onConfirm={() => dialog?.onConfirm()}
        onCancel={() => setDialog(null)}
      />
      <Toast message={toast?.message ?? null} tone={toast?.tone} onDone={dismissToast} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
