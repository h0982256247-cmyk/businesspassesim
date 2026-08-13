'use client'

// 收據檢視：套 ReceiptDocument 版型 → 下載 PDF（瀏覽器端）＋ LINE 轉發傳收據圖。
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'
import ReceiptDocument, { type ReceiptData } from '@/components/liff/ReceiptDocument'
import { downloadReceiptPdf, receiptToPngBlob } from '@/lib/liff/receipt-export'

export default function ReceiptViewPage() {
  const { id } = useParams<{ id: string }>()
  const C = useTenantColors()
  const { liff } = useLiff()
  const docRef = useRef<HTMLDivElement>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/receipts/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.receipt) setReceipt(d.receipt as ReceiptData); else setNotFound(true) })
      .catch(() => setNotFound(true))
  }, [id])

  const download = async () => {
    if (!docRef.current || !receipt || busy) return
    setBusy('pdf'); setMsg(null)
    try { await downloadReceiptPdf(docRef.current, `receipt-${receipt.receiptNumber}.pdf`) }
    catch { setMsg('下載失敗，請稍後再試') }
    finally { setBusy(null) }
  }

  const share = async () => {
    if (!docRef.current || !receipt || busy) return
    if (!liff?.isApiAvailable?.('shareTargetPicker')) { setMsg('此環境不支援轉發，請改用下載'); return }
    setBusy('share'); setMsg(null)
    try {
      const blob = await receiptToPngBlob(docRef.current)
      const fd = new FormData(); fd.append('file', blob, 'receipt.png')
      const up = await fetch(`/api/receipts/${id}/share-image`, { method: 'POST', body: fd }).then(r => r.json()).catch(() => null)
      if (!up?.url) throw new Error('upload failed')
      await liff.shareTargetPicker([{ type: 'image', originalContentUrl: up.url, previewImageUrl: up.url }])
    } catch { setMsg('轉發失敗，請稍後再試') }
    finally { setBusy(null) }
  }

  if (notFound) return <div style={{ padding: 48, textAlign: 'center', color: S.faint }}>收據不存在</div>
  if (!receipt) return <PageSkeleton rows={4} />

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 12px 96px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={download} disabled={!!busy}
          style={{ flex: 1, padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, border: 'none', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy === 'pdf' ? '處理中…' : '下載 PDF'}
        </button>
        <button onClick={share} disabled={!!busy}
          style={{ flex: 1, padding: '12px', borderRadius: 12, background: S.white, color: C.primaryText, border: `1px solid ${C.primary}44`, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy === 'share' ? '處理中…' : 'LINE 轉發'}
        </button>
      </div>
      {msg && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>{msg}</p>}

      <div style={{ overflowX: 'auto', background: '#eef0f3', padding: 12, borderRadius: 12 }}>
        <div ref={docRef} style={{ width: 760, margin: '0 auto' }}>
          <ReceiptDocument receipt={receipt} />
        </div>
      </div>
    </div>
  )
}
