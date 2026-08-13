'use client'

// 我要收據：每筆完成付款的訂單付款時已自動產生收據（空白買受人）。
// 此頁列出訂單→點入收據檢視／下載／轉發；需要抬頭統編可在收據頁自行填寫。
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
  receipt: { id: string; receiptNumber: string; shareToken: string; type: string; fieldsLocked: boolean; buyerName: string | null } | null
}

export default function ReceiptsPage() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const [orders, setOrders] = useState<OrderRow[] | null>(null)

  useEffect(() => {
    fetch('/api/receipts/orders')
      .then(r => (r.ok ? r.json() : { orders: [] }))
      .then(d => setOrders(d.orders ?? []))
      .catch(() => setOrders([]))
  }, [])

  if (orders === null) return <PageSkeleton rows={4} />

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px 96px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: S.ink, margin: '0 0 4px', letterSpacing: '-0.02em' }}>我要收據</h1>
      <p style={{ fontSize: 13, color: S.faint, margin: '0 0 20px' }}>每筆完成付款的訂單都有收據，可下載或轉發；需要抬頭／統編可自行填寫。</p>

      {orders.length === 0 ? (
        <p style={{ fontSize: 14, color: S.faint, textAlign: 'center', padding: '48px 0' }}>目前沒有可開立收據的訂單</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(o => {
            const filled = o.receipt?.fieldsLocked
            return (
              <button key={o.id} onClick={() => o.receipt && router.push(`${base}/receipts/${o.receipt.id}`)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: S.white, borderRadius: 16, border: `1px solid ${S.line}`, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: S.ink, margin: 0 }}>{o.orderItems[0]?.productName ?? 'eSIM'}</p>
                  <span style={{ fontSize: 16, color: C.primaryText, fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>›</span>
                </div>
                <p style={{ fontSize: 12, color: S.faint, margin: '3px 0 0' }}>
                  NT${o.totalPaid.toLocaleString()}
                  {o.paidAt && ` · ${new Date(o.paidAt).toLocaleDateString('zh-TW')}`}
                </p>
                {o.receipt && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: S.muted, letterSpacing: '0.02em' }}>{o.receipt.receiptNumber}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 100,
                      background: filled ? '#dcfce7' : C.soft, color: filled ? '#166534' : C.primaryText }}>
                      {filled ? '已填買受人' : '可填買受人'}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
