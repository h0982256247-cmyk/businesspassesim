'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors, useTenant } from '@/components/liff/TenantContext'
import { useCachedData } from '@/hooks/useCachedData'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'
import { EmptyOrdersIllustration } from '@/components/liff/LiffIllustrations'
import {
  deriveEsimStatus, groupOf,
  TAB_ORDER, TAB_LABEL, type OrdersTab,
} from '@/lib/esimStatus'
import { IconSim, IconQr, IconInstall, IconClock, IconShare, IconGift } from '@/components/liff/EsimIcons'
import ConfirmDialog from '@/components/liff/ConfirmDialog'
import Toast from '@/components/liff/Toast'
import type { ReactNode } from 'react'

// ─── Types ─────────────────────────────────────────────────────

type Order = {
  id: string
  orderNumber: string | null
  status: string
  totalPaid: number
  createdAt: string
  bundleId: string | null
  failureReason: string | null
  cancelReason: string | null
  esimRcode: string | null
  esimQrcode: string | null
  esimIccid: string | null
  activationStart: string | null
  activationEnd: string | null
  redeemedAt: string | null
  activatedAt: string | null
  orderItems: { productName: string; qty: number; unitPrice: number; product?: { dataCapacity: string | null } | null }[]
  transferredAway: boolean   // 我買的、已轉贈出去（歷史顯示）
  receivedGift: boolean      // 我收到的轉贈
  gift: { claimedAt: string | null; cancelledAt: string | null; expiresAt: string; toName: string | null; fromName: string | null } | null
}

type EsimUsage = {
  iccid: string
  totalData: number
  usedData: number
  remainingData: number
  unit: string
}

// ─── Helpers ──────────────────────────────────────────────────

function formatData(mb: number, unit: string): string {
  if (unit === 'GB' || mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toLocaleString()} MB`
}

// 轉贈狀態 pill（收到轉贈 / 等待對方領取）。已轉贈出去改在歷史列顯示「已轉贈給 ○○○」。
function giftBadge(o: Order): { text: string; bg: string; color: string; kind: 'received' | 'waiting' } | null {
  if (o.receivedGift && o.gift?.fromName) {
    return { text: `由 ${o.gift.fromName} 轉贈`, bg: '#ede9fe', color: '#6d28d9', kind: 'received' }
  }
  const g = o.gift
  if (g && !g.claimedAt && !g.cancelledAt && !o.transferredAway && new Date(g.expiresAt) > new Date()) {
    return { text: '等待領取', bg: '#ffedd5', color: '#c2410c', kind: 'waiting' }
  }
  return null
}

function GiftBadgeIcon({ kind }: { kind: 'received' | 'waiting' }) {
  return kind === 'received' ? <IconGift size={11} /> : <IconShare size={11} />
}

// ─── Page ──────────────────────────────────────────────────────

export default function OrdersPage() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const tenant = useTenant()
  const { liff } = useLiff()
  const searchParams = useSearchParams()
  const bundleIdParam = searchParams.get('bundleId')

  const [actioning, setActioning] = useState<string | null>(null)   // 哪個 order 正在處理
  const [tab, setTab] = useState<OrdersTab | null>(null)            // null = 用 defaultTab
  const [usageMap, setUsageMap] = useState<Record<string, EsimUsage | null>>({})
  const usageFetchedRef = useRef<Set<string>>(new Set())
  // 自訂確認彈窗（取代 window.confirm，避免 LINE 內建瀏覽器露出網址）
  const [dialog, setDialog] = useState<null | {
    title: string; lines: string[]; confirmLabel: string;
    tone?: 'primary' | 'danger'; icon?: ReactNode; onConfirm: () => void
  }>(null)
  // 輕量提示（取代 alert）
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' | 'info' } | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])

  const { data, loading, refresh } = useCachedData('orders', async () => {
    const o = await fetch('/api/orders').then(r => r.json())
    return { orders: (o.orders ?? []) as Order[] }
  })
  const orders = useMemo(() => data?.orders ?? [], [data])

  // 付款成功落地（?paid=1）→ 短暫重抓幾次，讓剛付款、背景開卡中的訂單盡快由「準備中」
  // 升級為「可安裝」。（同步刷卡路徑通常第一次就抓到；3DS / LINE Pay 是背景開卡稍慢。）
  useEffect(() => {
    if (typeof window === 'undefined' || searchParams.get('paid') !== '1') return
    let tries = 0
    const id = setInterval(() => {
      tries += 1
      if (tries > 5) { clearInterval(id); return }
      refresh()
    }, 1800)
    return () => clearInterval(id)
  }, [searchParams, refresh])

  // 付款失敗/取消的 redirect（?status≠0 + oid）→ 主動取消該待付款單。
  // 沿用原訂單詳情頁邏輯：LINE Pay 取消的 webhook 有時延遲，避免單子卡在「處理中」。
  const autoCancelDoneRef = useRef(false)
  useEffect(() => {
    if (autoCancelDoneRef.current) return
    const status = searchParams.get('status')
    const oid = searchParams.get('oid')
    if (status == null || status === '0' || !oid) return
    autoCancelDoneRef.current = true
    fetch(`/api/orders/${oid}/cancel`, { method: 'POST' }).then(() => refresh()).catch(() => {})
  }, [searchParams, refresh])

  // 分桶：依「使用者視角 phase」歸到三個分頁 + 一個處理中橫幅
  const buckets = useMemo(() => {
    const active: Order[] = []          // 使用中（含即將到期）
    const install: Order[] = []         // 待安裝（可安裝 / 待啟用 / 產生 QR 中）
    const history: Order[] = []         // 已結束 / 取消 / 退款 / 失敗
    const awaitingPayment: Order[] = [] // 處理中橫幅：等付款確認
    const preparing: Order[] = []       // 處理中橫幅：已付款開卡中
    for (const o of orders) {
      // 已轉贈出去的訂單一律歸到歷史（顯示「已轉贈給 ○○○」，無任何操作）
      if (o.transferredAway) { history.push(o); continue }
      const phase = deriveEsimStatus(o).phase
      switch (groupOf(phase)) {
        case 'active':  active.push(o); break
        case 'install': install.push(o); break
        case 'history': history.push(o); break
        case 'processing':
          if (phase === 'awaitingPayment') awaitingPayment.push(o)
          else preparing.push(o)
          break
      }
    }
    return { active, install, history, awaitingPayment, preparing }
  }, [orders])

  // 「準備 eSIM 中」(已付款開卡中) 改放到「待安裝」分頁下方低調顯示（不再佔頂部橫幅），
  // 背景輪詢拿到卡後自動升級為「可安裝」。
  const counts: Record<OrdersTab, number> = {
    install: buckets.install.length + buckets.preparing.length,
    history: buckets.history.length,
  }

  // 從結帳頁帶 ?bundleId=… 進來、且該 bundle 全失敗 → 預設切到「歷史」並顯示紅 banner
  const bundleOrders = useMemo(
    () => bundleIdParam ? orders.filter(o => o.bundleId === bundleIdParam) : [],
    [orders, bundleIdParam],
  )
  const bundleAllFailed = bundleOrders.length > 0 && bundleOrders.every(
    o => ['FAILED', 'CANCELLED', 'REFUNDED'].includes(o.status),
  )
  const bundleFirstFailureReason = bundleOrders.find(o => o.failureReason)?.failureReason ?? null

  // 預設分頁：bundle 全失敗→歷史；否則一律停在「待安裝」（消費者一進來先看到要做的動作）
  const defaultTab: OrdersTab = bundleAllFailed ? 'history' : 'install'
  const activeTab = tab ?? defaultTab

  // 使用中卡常駐頂部 → 一進來就 best-effort 抓流量（只打有 ICCID 的，每張只打一次）
  useEffect(() => {
    const toFetch = buckets.active.filter(o => o.esimIccid && !usageFetchedRef.current.has(o.id))
    if (toFetch.length === 0) return
    let cancelled = false
    toFetch.forEach(o => usageFetchedRef.current.add(o.id))
    ;(async () => {
      for (const o of toFetch) {
        try {
          const d = await fetch(`/api/orders/${o.id}/usage`).then(r => r.json())
          if (!cancelled) setUsageMap(m => ({ ...m, [o.id]: d.usage ?? null }))
        } catch {
          if (!cancelled) setUsageMap(m => ({ ...m, [o.id]: null }))
        }
      }
    })()
    return () => { cancelled = true }
  }, [buckets.active])

  // 背景輪詢：有「等待付款確認」或「準備 eSIM 中」的訂單時，每 10 秒重抓一次，
  // 並在切回前景時立即刷新。卡片狀態一變（拿到 eSIM）就自動移到「待安裝」，不用換頁。
  // 兩種處理中訂單都清空後自動停止輪詢。
  const processingActive = buckets.preparing.length > 0 || buckets.awaitingPayment.length > 0
  useEffect(() => {
    if (!processingActive) return
    const id = setInterval(() => { refresh() }, 10_000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [processingActive, refresh])

  // ─── Handlers ────────────────────────────────────────────────

  // 一鍵取消所有卡在等待付款的訂單（特別處理使用者在 LINE Pay 取消後留下的殭屍訂單）
  const handleCancelStuck = () => {
    if (actioning) return
    setDialog({
      title: `取消 ${buckets.awaitingPayment.length} 筆未完成付款的訂單？`,
      lines: ['若你剛在 LINE Pay 或銀行頁取消了付款，', '可一鍵清掉這些等待中的訂單。'],
      confirmLabel: '取消訂單',
      tone: 'danger',
      onConfirm: () => { setDialog(null); doCancelStuck() },
    })
  }

  const doCancelStuck = async () => {
    setActioning('bulk_cancel')
    await Promise.all(
      buckets.awaitingPayment.map(o => fetch(`/api/orders/${o.id}/cancel`, { method: 'POST' }).catch(() => null))
    )
    setActioning(null)
    await refresh()
  }

  const handleRedeem = (o: Order) => {
    setDialog({
      title: '確定要安裝這張 eSIM 嗎？',
      lines: ['安裝後會立即產生 QR 碼並綁定這支手機，', '請在要長期使用這張 eSIM 的手機上安裝。'],
      confirmLabel: '確定安裝',
      tone: 'primary',
      icon: <IconInstall size={24} />,
      onConfirm: () => { setDialog(null); doRedeem(o) },
    })
  }

  const doRedeem = async (o: Order) => {
    setActioning(o.id)
    const r = await fetch(`/api/orders/${o.id}/redeem`, { method: 'POST' }).then(x => x.json())
    setActioning(null)
    if (r.error) {
      setToast({ message: `兌換失敗：${r.error}`, tone: 'error' })
      return
    }
    // 兌換觸發成功 → 導去詳情頁等 QR
    router.push(`${base}/orders/${o.id}`)
  }

  // 轉贈：點擊直接建立轉贈連結並開 LINE shareTargetPicker（不再有確認彈窗）
  const handleShare = (o: Order) => {
    if (!liff?.isLoggedIn()) { setToast({ message: '請先登入 LINE', tone: 'error' }); return }
    if (!liff.isApiAvailable('shareTargetPicker')) { setToast({ message: '您的 LINE 版本不支援分享', tone: 'error' }); return }
    doShare(o)
  }

  const doShare = async (o: Order) => {
    if (!liff) return
    setActioning(o.id)
    try {
      const r = await fetch(`/api/orders/${o.id}/gift`, { method: 'POST' }).then(x => x.json())
      if (!r.ok) { setToast({ message: `轉贈失敗：${r.error}`, tone: 'error' }); setActioning(null); return }
      const fullUrl = `${window.location.origin}${base}/gift/${r.token}`
      let giftLink = fullUrl
      try { giftLink = await liff.permanentLink.createUrlBy(fullUrl) } catch {}

      const item = o.orderItems[0]
      const cap = item?.product?.dataCapacity
      const planLabel = cap && !item.productName.includes(cap) ? `${item.productName} · ${cap}` : (item?.productName ?? 'eSIM')
      const brandName = tenant?.brandName ?? 'eSIM'
      const flex = {
        type: 'flex' as const,
        altText: `你收到一張來自「${brandName}」的 eSIM：${planLabel}`,
        contents: {
          type: 'bubble' as const,
          body: {
            type: 'box' as const, layout: 'vertical' as const, spacing: 'md',
            contents: [
              { type: 'text' as const, text: `你收到一張來自「${brandName}」的 eSIM`, weight: 'bold' as const, size: 'lg' as const, color: '#1a1a1a', wrap: true },
              { type: 'text' as const, text: planLabel, size: 'md' as const, weight: 'bold' as const, wrap: true, color: C.primaryText },
              { type: 'text' as const, text: '點下方按鈕領取，即可安裝使用', size: 'sm' as const, color: '#475569', wrap: true },
              { type: 'separator' as const, margin: 'md' as const },
              { type: 'text' as const, text: '⚠ 連結 7 天內有效，請盡快領取', size: 'xs' as const, color: '#94a3b8', wrap: true },
            ],
          },
          footer: {
            type: 'box' as const, layout: 'vertical' as const, spacing: 'sm',
            contents: [
              { type: 'button' as const, style: 'primary' as const, color: C.primaryText,
                action: { type: 'uri' as const, label: '領取這張 eSIM', uri: giftLink } },
            ],
          },
        },
      }
      await liff.shareTargetPicker([flex])
      await refresh()
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '轉贈失敗', tone: 'error' })
    }
    setActioning(null)
  }

  // ─── Render ──────────────────────────────────────────────────

  if (loading) return <PageSkeleton rows={4} />

  const hasAnything = orders.length > 0

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        我的 eSIM
      </h1>

      {/* Bundle 結帳後若整組失敗 → 頂部紅 banner + 重新下單 CTA。 */}
      {bundleAllFailed && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '18px 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c', margin: '0 0 6px' }}>付款未完成</p>
          <p style={{ fontSize: 13, color: '#dc2626', margin: '0 0 14px', lineHeight: 1.6 }}>
            {bundleFirstFailureReason ?? '本次結帳的訂單未完成付款，請重新下單再試一次。'}
          </p>
          <button onClick={() => router.push(`${base}/products`)}
            style={{ width: '100%', padding: '12px 0', border: 'none', borderRadius: 12, background: C.primary, color: C.onPrimary, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            重新下單
          </button>
        </div>
      )}

      {!hasAnything && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' }}>
          <EmptyOrdersIllustration size={80} />
          <p style={{ fontSize: 14, color: S.faint }}>目前還沒有訂單</p>
          <button onClick={() => router.push(`${base}/products`)}
            style={{ marginTop: 8, background: C.primary, color: C.onPrimary, border: 'none', borderRadius: 100, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            去商城選方案
          </button>
        </div>
      )}

      {hasAnything && (
        <>
          {/* ── 等待付款確認橫幅：只處理「付款尚未確認」的殭屍訂單（可一鍵取消）。
                 已付款、準備 eSIM 中的訂單不放這裡，改在「待安裝」分頁下方低調顯示。 ── */}
          {buckets.awaitingPayment.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fde68a', borderTopColor: '#d97706', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#a16207' }}>{buckets.awaitingPayment.length} 筆等待付款確認</span>
                </div>
                <button onClick={handleCancelStuck} disabled={!!actioning}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: '#b45309', fontWeight: 700, textDecoration: 'underline', padding: 0 }}>
                  {actioning === 'bulk_cancel' ? '取消中…' : '全部取消'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buckets.awaitingPayment.map(o => (
                  <ProcessingRow key={o.id} order={o} stage="awaiting" onClick={() => router.push(`${base}/orders/${o.id}`)} />
                ))}
              </div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {/* ── 使用中：釘在頂部常駐，跨分頁都看得到 ── */}
          {buckets.active.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 4px 10px' }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: S.ink, margin: 0 }}>使用中</h2>
                <span style={{ fontSize: 11, color: S.faint }}>{buckets.active.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {buckets.active.map(o => (
                  <ActiveCard key={o.id} order={o} usage={usageMap[o.id]} primary={C.primary}
                    onClick={() => router.push(`${base}/orders/${o.id}`)} />
                ))}
              </div>
            </div>
          )}

          {/* ── 分頁籤（sticky）：待安裝 / 歷史 ── */}
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 4, paddingBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
              {TAB_ORDER.map(t => {
                const sel = activeTab === t
                return (
                  <button key={t} onClick={() => setTab(t)}
                    style={{
                      border: 'none', borderRadius: 9, padding: '9px 4px', cursor: 'pointer',
                      background: sel ? '#fff' : 'transparent',
                      boxShadow: sel ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      color: sel ? S.ink : S.muted, fontWeight: sel ? 700 : 600, fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      transition: 'background 0.15s',
                    }}>
                    {TAB_LABEL[t]}
                    {counts[t] > 0 && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, minWidth: 17, textAlign: 'center',
                        color: sel ? C.onPrimary : S.faint,
                        background: sel ? C.primary : '#e2e8f0',
                        borderRadius: 100, padding: '0 5px', lineHeight: '16px',
                      }}>
                        {counts[t]}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── 分頁內容 ── */}
          {activeTab === 'install' && (
            (buckets.install.length + buckets.preparing.length) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {buckets.install.map(o => {
                  const phase = deriveEsimStatus(o).phase
                  if (phase === 'readyToInstall') return (
                    <PendingCard key={o.id} order={o} primary={C.primary} primaryText={C.primaryText} onPrimary={C.onPrimary}
                      actioning={actioning === o.id}
                      canShare={!!tenant?.transferEnabled}
                      onRedeem={() => handleRedeem(o)} onShare={() => handleShare(o)}
                      onClick={() => router.push(`${base}/orders/${o.id}`)} />
                  )
                  if (phase === 'installable') return (
                    <InstallableCard key={o.id} order={o} primary={C.primary} primaryText={C.primaryText}
                      onClick={() => router.push(`${base}/orders/${o.id}`)} />
                  )
                  return (
                    <ProcessingRow key={o.id} order={o} stage="redeeming" boxed
                      onClick={() => router.push(`${base}/orders/${o.id}`)} />
                  )
                })}
                {/* 已付款、準備 eSIM 中：低調顯示在下方，背景輪詢拿到卡後自動變「可以安裝」 */}
                {buckets.preparing.map(o => (
                  <ProcessingRow key={o.id} order={o} stage="ordered" boxed
                    onClick={() => router.push(`${base}/orders/${o.id}`)} />
                ))}
              </div>
            ) : <TabEmpty text="沒有待安裝的 eSIM" />
          )}

          {activeTab === 'history' && (
            buckets.history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {buckets.history.map(o => (
                  <CompactRow key={o.id} order={o} onClick={() => router.push(`${base}/orders/${o.id}`)} />
                ))}
              </div>
            ) : <TabEmpty text="沒有歷史紀錄" />
          )}
        </>
      )}

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
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function TabEmpty({ text }: { text: string }) {
  return (
    <p style={{ textAlign: 'center', fontSize: 13, color: S.faint, padding: '40px 0' }}>{text}</p>
  )
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 100, height: 7, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 100, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function ActiveCard({ order, usage, primary, onClick }: {
  order: Order; usage: EsimUsage | null | undefined; primary: string; onClick: () => void
}) {
  const productName = order.orderItems[0]?.productName ?? 'eSIM'
  const view = deriveEsimStatus(order)
  const expiring = view.phase === 'expiringSoon'

  const accent  = expiring ? '#c2410c' : '#047857'
  const deepInk = expiring ? '#7c2d12' : '#064e3b'
  const subInk  = expiring ? '#9a3412' : '#065f46'
  const bg      = expiring ? 'linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)' : 'linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%)'
  const border  = expiring ? '#fdba74' : '#6ee7b7'
  const shadow  = expiring ? '0 2px 8px rgba(234,88,12,0.15)' : '0 2px 8px rgba(16,185,129,0.15)'

  return (
    <button onClick={onClick}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: bg, border: `1px solid ${border}`, borderRadius: 18, padding: '18px 20px', boxShadow: shadow }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, background: '#fff', padding: '4px 10px', borderRadius: 100 }}>
          {view.label}
        </span>
      </div>

      <p style={{ fontSize: 18, fontWeight: 800, color: deepInk, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        {productName}
      </p>
      {/* 用量總覽：剩餘流量 + 剩餘天數放大（使用者最常回來看的兩個數字一眼可見） */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.78)', borderRadius: 14, padding: '12px 14px' }}>
          <p style={{ fontSize: 11, color: subInk, fontWeight: 600, margin: '0 0 3px' }}>剩餘流量</p>
          {usage ? (
            <>
              <p style={{ fontSize: 23, fontWeight: 900, color: deepInk, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
                {formatData(usage.remainingData, usage.unit)}
              </p>
              <div style={{ marginTop: 9 }}><UsageBar used={usage.usedData} total={usage.totalData} /></div>
              <p style={{ fontSize: 10.5, color: subInk, opacity: 0.65, margin: '5px 0 0' }}>共 {formatData(usage.totalData, usage.unit)}</p>
            </>
          ) : (
            <p style={{ fontSize: 14, fontWeight: 700, color: subInk, opacity: 0.7, margin: '4px 0 0' }}>
              {order.esimIccid ? '查詢中…' : '安裝後顯示'}
            </p>
          )}
        </div>
        {view.daysLeft != null && view.daysLeft >= 0 && (
          <div style={{ flex: '0 0 100px', background: 'rgba(255,255,255,0.78)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ fontSize: 11, color: subInk, fontWeight: 600, margin: '0 0 3px' }}>剩餘天數</p>
            <p style={{ fontSize: 23, fontWeight: 900, color: expiring ? accent : deepInk, lineHeight: 1, margin: 0 }}>
              {view.daysLeft}<span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>天</span>
            </p>
            {order.activationEnd && (
              <p style={{ fontSize: 10.5, color: subInk, opacity: 0.65, margin: '6px 0 0' }}>
                {new Date(order.activationEnd).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })} 到期
              </p>
            )}
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: primary, fontWeight: 700, margin: '12px 0 0' }}>
        查看 QR、流量與安裝資訊 →
      </p>
    </button>
  )
}

function InstallableCard({ order, primary, primaryText, onClick }: { order: Order; primary: string; primaryText: string; onClick: () => void }) {
  const productName = order.orderItems[0]?.productName ?? 'eSIM'
  const dataCapacity = order.orderItems[0]?.product?.dataCapacity
  return (
    <button onClick={onClick}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: `${primary}14`, color: primaryText, padding: '3px 8px', borderRadius: 100 }}>
            <IconQr size={11} /> QR 已就緒
          </span>
          <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: '8px 0 2px' }}>
            {productName}
            {dataCapacity && !productName.includes(dataCapacity) && <span style={{ fontSize: 12.5, fontWeight: 600, color: S.muted, marginLeft: 6 }}>· {dataCapacity}</span>}
          </p>
          <p style={{ fontSize: 11, color: S.muted, margin: 0 }}>點擊查看 QR 與一鍵安裝</p>
        </div>
        <span style={{ fontSize: 14, color: primary, fontWeight: 700 }}>→</span>
      </div>
    </button>
  )
}

function PendingCard({ order, primary, primaryText, onPrimary, actioning, canShare, onRedeem, onShare, onClick }: {
  order: Order; primary: string; primaryText: string; onPrimary: string; actioning: boolean; canShare: boolean;
  onRedeem: () => void; onShare: () => void; onClick: () => void
}) {
  const productName = order.orderItems[0]?.productName ?? 'eSIM'
  const dataCapacity = order.orderItems[0]?.product?.dataCapacity
  const gift = giftBadge(order)
  const isReceived = order.receivedGift   // 收到的轉贈 → 不可再轉贈出去

  return (
    <div style={{ background: S.white, border: `1px solid ${S.line}`, borderRadius: 16, padding: '16px', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.05)' }}>
      <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: `${primary}14`, color: primaryText, padding: '3px 10px', borderRadius: 100 }}>
            <IconSim size={11} /> 可以安裝
          </span>
          {gift && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, background: gift.bg, color: gift.color, padding: '3px 10px', borderRadius: 100 }}>
              <GiftBadgeIcon kind={gift.kind} />{gift.text}
            </span>
          )}
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: S.ink, margin: '0 0 4px' }}>
          {productName}
          {dataCapacity && !productName.includes(dataCapacity) && <span style={{ fontSize: 13, fontWeight: 600, color: S.muted, marginLeft: 6 }}>· {dataCapacity}</span>}
        </p>
        <p style={{ fontSize: 11, color: S.faint, margin: '0 0 12px' }}>
          {new Date(order.createdAt).toLocaleDateString('zh-TW')}
        </p>
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: (canShare && !isReceived) ? '2fr 1fr' : '1fr', gap: 8 }}>
        <button onClick={onRedeem} disabled={actioning}
          style={{ background: primary, color: onPrimary, border: 'none', borderRadius: 100, padding: '11px', fontSize: 14, fontWeight: 700, cursor: actioning ? 'wait' : 'pointer', opacity: actioning ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {actioning ? '處理中…' : <><IconInstall size={15} /> 我要安裝</>}
        </button>
        {canShare && !isReceived && (
          <button onClick={onShare} disabled={actioning}
            style={{ background: S.white, color: primary, border: `1.5px solid ${primary}`, borderRadius: 100, padding: '11px', fontSize: 13, fontWeight: 700, cursor: actioning ? 'wait' : 'pointer', opacity: actioning ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <IconShare size={14} /> 轉贈
          </button>
        )}
      </div>
    </div>
  )
}

// 處理中／產生 QR 中的精簡列。boxed=true 時自帶卡片外框（用於分頁內），
// 否則為橫幅內的緊湊列。
function ProcessingRow({ order, stage, boxed, onClick }: {
  order: Order; stage: 'awaiting' | 'ordered' | 'redeeming'; boxed?: boolean; onClick: () => void
}) {
  const productName = order.orderItems[0]?.productName ?? 'eSIM'
  const text = stage === 'awaiting' ? '等待付款確認中…'
             : stage === 'ordered'  ? '正在準備 eSIM，請稍候…'
             :                         '正在生成 QR 碼，請稍候…'
  return (
    <button onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: boxed ? '#fffbeb' : 'transparent',
        border: boxed ? '1px solid #fde68a' : 'none',
        borderRadius: boxed ? 16 : 0, padding: boxed ? '14px 16px' : '2px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: boxed ? 14 : 13, fontWeight: 600, color: S.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productName}</p>
        <p style={{ fontSize: 11, color: '#a16207', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}><IconClock size={11} /> {text}</p>
      </div>
      <span style={{ fontSize: 13, color: S.faint, flexShrink: 0 }}>→</span>
    </button>
  )
}

function CompactRow({ order, onClick }: { order: Order; onClick: () => void }) {
  const productName = order.orderItems[0]?.productName ?? 'eSIM'
  const gifted = order.transferredAway
  const giftedTo = order.gift?.toName ?? '朋友'
  const view = deriveEsimStatus(order)
  const label = gifted ? `已轉贈給 ${giftedTo}` : view.label
  const color = gifted ? '#6d28d9' : view.phase === 'failed' ? '#b91c1c' : view.phase === 'ended' ? '#15803d' : S.faint
  return (
    <button onClick={onClick}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: S.white, border: `1px solid ${S.line}`, borderRadius: 12, padding: '12px 14px', opacity: 0.85 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
          <p style={{ fontSize: 13, fontWeight: 600, color: S.ink, margin: '2px 0 0' }}>{productName}</p>
        </div>
        <span style={{ fontSize: 11, color: S.faint }}>{new Date(order.createdAt).toLocaleDateString('zh-TW')}</span>
      </div>
    </button>
  )
}

