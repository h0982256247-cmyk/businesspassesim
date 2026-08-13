'use client'

// 開立收據：列出可開立收據的訂單 → 選個人/公司（公司再選抬頭）＋退貨聲明 → 開立 → 導到收據檢視。
// 收據為台灣報帳文件，UI 固定中文。
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'

type OrderRow = {
  id: string
  totalPaid: number
  paidAt: string | null
  wmOrderId: string | null
  orderItems: { productName: string; qty: number }[]
  company: { id: string; name: string; taxId: string | null } | null
  receipt: { id: string; receiptNumber: string; shareToken: string; type: string } | null
}

export default function ReceiptsPage() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const [orders, setOrders] = useState<OrderRow[] | null>(null)
  const [issuing, setIssuing] = useState<OrderRow | null>(null)
  const [type, setType] = useState<'personal' | 'company'>('personal')
  const [titlePersonal, setTitlePersonal] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/receipts/orders')
      .then(r => (r.ok ? r.json() : { orders: [] }))
      .then(d => setOrders(d.orders ?? []))
      .catch(() => setOrders([]))
  }, [])

  const openIssue = (o: OrderRow) => {
    setIssuing(o)
    setType(o.company?.taxId ? 'company' : 'personal')
    setTitlePersonal(false)
    setAgree(false)
    setErr(null)
  }

  const doIssue = async () => {
    if (!issuing || !agree || busy) return
    setBusy(true); setErr(null)
    const r = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: issuing.id, type, companyTitlePersonal: type === 'company' && titlePersonal }),
    }).catch(() => null)
    setBusy(false)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r && r.ok && d.receipt) { router.push(`${base}/receipts/${d.receipt.id}`); return }
    setErr(d.error ?? '開立失敗，請稍後再試')
  }

  if (orders === null) return <PageSkeleton rows={4} />

  const btn = (bg: string, fg: string): React.CSSProperties => ({
    width: '100%', padding: '10px', borderRadius: 12, background: bg, color: fg,
    border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  })

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 4px', letterSpacing: '-0.02em' }}>開立收據</h1>
      <p style={{ fontSize: 13, color: S.faint, margin: '0 0 20px' }}>選擇訂單開立收據，可下載或轉發給好友。</p>

      {orders.length === 0 ? (
        <p style={{ fontSize: 14, color: S.faint, textAlign: 'center', padding: '48px 0' }}>目前沒有可開立收據的訂單</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(o => (
            <div key={o.id} style={{ background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: '0 0 2px' }}>{o.orderItems[0]?.productName ?? 'eSIM'}</p>
              <p style={{ fontSize: 12, color: S.faint, margin: '0 0 10px' }}>
                NT${o.totalPaid.toLocaleString()}
                {o.paidAt && ` · ${new Date(o.paidAt).toLocaleDateString('zh-TW')}`}
                {o.company && ` · ${o.company.name}`}
              </p>
              {o.receipt ? (
                <button onClick={() => router.push(`${base}/receipts/${o.receipt!.id}`)} style={btn(S.white, C.primaryText)}>
                  <span style={{ display: 'inline-block', border: `1px solid ${C.primary}44`, borderRadius: 12, padding: '9px 0', width: '100%' }}>檢視收據（{o.receipt.receiptNumber}）</span>
                </button>
              ) : (
                <button onClick={() => openIssue(o)} style={btn(C.primary, C.onPrimary)}>開立收據</button>
              )}
            </div>
          ))}
        </div>
      )}

      {issuing && (
        <div onClick={() => !busy && setIssuing(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 90 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, padding: '20px 18px 28px', boxSizing: 'border-box' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: S.ink, margin: '0 0 14px' }}>開立收據</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['personal', 'company'] as const).map(tp => {
                if (tp === 'company' && !issuing.company?.taxId) return null
                const active = type === tp
                return (
                  <button key={tp} onClick={() => setType(tp)}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      background: active ? C.primary : S.white, color: active ? C.onPrimary : S.muted,
                      border: `1px solid ${active ? C.primary : S.line}` }}>
                    {tp === 'personal' ? '個人收據' : '公司收據'}
                  </button>
                )
              })}
            </div>

            {type === 'company' && issuing.company && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: S.muted, margin: '0 0 6px' }}>收據抬頭</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['company', issuing.company.name], ['personal', '個人姓名']] as const).map(([k, label]) => {
                    const active = (k === 'personal') === titlePersonal
                    return (
                      <button key={k} onClick={() => setTitlePersonal(k === 'personal')}
                        style={{ flex: 1, padding: '8px 6px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          background: active ? C.soft : S.white, color: active ? C.primaryText : S.muted,
                          border: `1px solid ${active ? C.primary : S.line}` }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: S.faint, margin: '6px 0 0' }}>統一編號 {issuing.company.taxId}（開立後鎖定不可改）</p>
              </div>
            )}

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: S.muted, margin: '6px 0 14px', lineHeight: 1.6 }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>若已開立收據的訂單自行申請退貨並成功退貨，該收據將無法作為報帳用途，如有虛報自行承擔法律責任。</span>
            </label>

            {err && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>{err}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setIssuing(null)} disabled={busy}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: S.white, color: S.muted, border: `1px solid ${S.line}`, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
              <button onClick={doIssue} disabled={busy || !agree}
                style={{ flex: 2, padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, border: 'none', fontSize: 14, fontWeight: 700, cursor: busy || !agree ? 'default' : 'pointer', opacity: busy || !agree ? 0.5 : 1 }}>
                {busy ? '開立中…' : '確定開立'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
