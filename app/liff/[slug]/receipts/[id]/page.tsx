'use client'

// 收據檢視：套 ReceiptDocument 版型。下載＝產生收據圖後以彈窗顯示（長按存圖，
// 因 LINE 內建瀏覽器不支援 a.download blob）；轉發＝產圖上傳後 shareTargetPicker 傳圖。
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'
import ReceiptDocument, { type ReceiptData } from '@/components/liff/ReceiptDocument'
import { receiptToPngBlob } from '@/lib/liff/receipt-export'

export default function ReceiptViewPage() {
  const { id } = useParams<{ id: string }>()
  const C = useTenantColors()
  const { liff } = useLiff()
  const docRef = useRef<HTMLDivElement>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<'img' | 'share' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saveUrl, setSaveUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/receipts/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.receipt) setReceipt(d.receipt as ReceiptData); else setNotFound(true) })
      .catch(() => setNotFound(true))
  }, [id])

  // 產生收據 PNG → 上傳公開 bucket → 回公開網址（下載彈窗與 LINE 轉發共用）。
  const genAndUpload = async (): Promise<string | null> => {
    if (!docRef.current) return null
    const blob = await receiptToPngBlob(docRef.current)
    const fd = new FormData(); fd.append('file', blob, 'receipt.png')
    const up = await fetch(`/api/receipts/${id}/share-image`, { method: 'POST', body: fd }).then(r => r.json()).catch(() => null)
    return up?.url ?? null
  }

  const download = async () => {
    if (!receipt || busy) return
    setBusy('img'); setMsg(null)
    try {
      const url = await genAndUpload()
      if (!url) throw new Error('gen failed')
      setSaveUrl(url)
    } catch { setMsg('產生收據圖失敗，請稍後再試') }
    finally { setBusy(null) }
  }

  const share = async () => {
    if (!receipt || busy) return
    if (!liff?.isApiAvailable?.('shareTargetPicker')) { setMsg('此環境不支援轉發，請改用下載'); return }
    setBusy('share'); setMsg(null)
    try {
      const url = await genAndUpload()
      if (!url) throw new Error('gen failed')
      await liff.shareTargetPicker([{ type: 'image', originalContentUrl: url, previewImageUrl: url }])
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
          {busy === 'img' ? '處理中…' : '下載'}
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

      {saveUrl && (
        <div onClick={() => setSaveUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16 }}>
          <p style={{ color: '#fff', fontSize: 14, textAlign: 'center', margin: 0 }}>長按圖片存到相簿（電腦可按右鍵另存）</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={saveUrl} alt="收據" onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '74vh', borderRadius: 8, background: '#fff' }} />
          <button onClick={() => setSaveUrl(null)}
            style={{ background: '#fff', color: '#1a1a1a', border: 'none', borderRadius: 10, padding: '10px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>關閉</button>
        </div>
      )}
    </div>
  )
}
