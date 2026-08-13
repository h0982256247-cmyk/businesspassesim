'use client'

// 收據檢視：套 ReceiptDocument 版型。買受人資訊由消費者自行填寫（個人／公司），填完鎖定。
// 下載＝產生收據圖後以彈窗顯示（長按存圖，因 LINE 內建瀏覽器不支援 a.download blob）；
// 轉發＝產圖上傳後 shareTargetPicker 傳圖。
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'
import { S } from '@/lib/liff/tokens'
import ReceiptDocument, { type ReceiptData } from '@/components/liff/ReceiptDocument'
import { receiptToPngBlob } from '@/lib/liff/receipt-export'

// GET /api/receipts/:id 回傳的收據（含填寫狀態與下單當時企業）
type ReceiptDetail = ReceiptData & {
  fieldsLocked: boolean
  order?: { company: { name: string; taxId: string | null } | null } | null
}

export default function ReceiptViewPage() {
  const { id } = useParams<{ id: string }>()
  const C = useTenantColors()
  const { liff } = useLiff()
  const docRef = useRef<HTMLDivElement>(null)
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<'img' | 'share' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saveUrl, setSaveUrl] = useState<string | null>(null)

  // 填寫買受人 modal
  const company = receipt?.order?.company
  const canCompany = !!company?.taxId
  const [fillOpen, setFillOpen] = useState(false)
  const [fillType, setFillType] = useState<'personal' | 'company'>('personal')
  const [titlePersonal, setTitlePersonal] = useState(false)
  const [agree, setAgree] = useState(false)
  const [filling, setFilling] = useState(false)
  const [fillErr, setFillErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/receipts/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.receipt) setReceipt(d.receipt as ReceiptDetail); else setNotFound(true) })
      .catch(() => setNotFound(true))
  }, [id])

  const openFill = () => {
    setFillType(canCompany ? 'company' : 'personal')
    setTitlePersonal(false)
    setAgree(false)
    setFillErr(null)
    setFillOpen(true)
  }

  const doFill = async () => {
    if (!receipt || !agree || filling) return
    setFilling(true); setFillErr(null)
    const r = await fetch(`/api/receipts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: fillType, companyTitlePersonal: fillType === 'company' && titlePersonal }),
    }).catch(() => null)
    setFilling(false)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (r && r.ok && d.receipt) {
      // PATCH 回傳的收據列不含 order（company）→ 疊加保留原 order，更新買受人與鎖定狀態
      setReceipt(prev => (prev ? { ...prev, ...d.receipt } : (d.receipt as ReceiptDetail)))
      setFillOpen(false)
      return
    }
    setFillErr(d.error ?? '填寫失敗，請稍後再試')
  }

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
      {!receipt.fieldsLocked && (
        <div style={{ background: C.soft, borderRadius: 12, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ fontSize: 13, color: S.ink, margin: 0, flex: 1, lineHeight: 1.5 }}>此收據尚未填寫買受人，需要抬頭／統編報帳可自行填寫（填寫後鎖定不可修改）。</p>
          <button onClick={openFill}
            style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, background: C.primary, color: C.onPrimary, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>填寫</button>
        </div>
      )}

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

      {fillOpen && (
        <div onClick={() => !filling && setFillOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 90 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, padding: '20px 18px 28px', boxSizing: 'border-box' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: S.ink, margin: '0 0 14px' }}>填寫買受人資訊</p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['personal', 'company'] as const).map(tp => {
                if (tp === 'company' && !canCompany) return null
                const active = fillType === tp
                return (
                  <button key={tp} onClick={() => setFillType(tp)}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      background: active ? C.primary : S.white, color: active ? C.onPrimary : S.muted,
                      border: `1px solid ${active ? C.primary : S.line}` }}>
                    {tp === 'personal' ? '個人收據' : '公司收據'}
                  </button>
                )
              })}
            </div>

            {fillType === 'company' && company && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, color: S.muted, margin: '0 0 6px' }}>收據抬頭</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['company', company.name], ['personal', '個人姓名']] as const).map(([k, label]) => {
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
                <p style={{ fontSize: 11, color: S.faint, margin: '6px 0 0' }}>統一編號 {company.taxId}（填寫後鎖定不可改）</p>
              </div>
            )}

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: S.muted, margin: '6px 0 14px', lineHeight: 1.6 }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>若已開立收據的訂單自行申請退貨並成功退貨，該收據將無法作為報帳用途，如有虛報自行承擔法律責任。</span>
            </label>

            {fillErr && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 10px' }}>{fillErr}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setFillOpen(false)} disabled={filling}
                style={{ flex: 1, padding: '12px', borderRadius: 12, background: S.white, color: S.muted, border: `1px solid ${S.line}`, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
              <button onClick={doFill} disabled={filling || !agree}
                style={{ flex: 2, padding: '12px', borderRadius: 12, background: C.primary, color: C.onPrimary, border: 'none', fontSize: 14, fontWeight: 700, cursor: filling || !agree ? 'default' : 'pointer', opacity: filling || !agree ? 0.5 : 1 }}>
                {filling ? '填寫中…' : '確定填寫'}
              </button>
            </div>
          </div>
        </div>
      )}

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
