'use client'

import { useEffect, useState, type ReactNode, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/platform/Toast'

const TABS = ['品牌與網域', '金流 (TapPay)', 'eSIM (世界移動)', '福利價', '轉贈'] as const
type Tab = typeof TABS[number]

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400'

// 前端把上傳圖片縮到最長邊 max 並輸出 PNG data URI（保留透明；直接存進 logoUrl，沿用既有儲存）
function resizeImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('讀取失敗'))
    reader.onload = () => {
      const img = document.createElement('img')
      img.onerror = () => reject(new Error('圖片解析失敗'))
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('無法建立畫布'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

function Card({ title, children, onSave, saving, msg }: { title: string; children: ReactNode; onSave: () => void; saving: boolean; msg: string | null }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <h2 className="font-semibold text-gray-800">{title}</h2>
      {children}
      <div className="flex items-center gap-3">
        <button onClick={onSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition">{saving ? '儲存中…' : '儲存'}</button>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('品牌與網域')

  // 品牌與網域 + 福利價共用 /api/platform/settings
  const [s, setS] = useState<Record<string, string>>({})
  const [sSaving, setSSaving] = useState(false)
  const [sMsg, setSMsg] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  // 金流（TapPay：Partner Key / App ID / App Key / 環境 兩種支付共用；Merchant ID 與前台啟用各自）
  const [pay, setPay] = useState<{
    partnerKey: string; appId: string; appKey: string; env: string
    creditMerchantId: string; linePayMerchantId: string
    creditActive: boolean; linePayActive: boolean
  }>({ partnerKey: '', appId: '', appKey: '', env: 'sandbox', creditMerchantId: '', linePayMerchantId: '', creditActive: true, linePayActive: true })
  const [paySaving, setPaySaving] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  // eSIM
  const [esim, setEsim] = useState<Record<string, string>>({})
  const [esimSaving, setEsimSaving] = useState(false)
  const [esimMsg, setEsimMsg] = useState<string | null>(null)
  // 功能開關：eSIM 轉贈
  const [transferEnabled, setTransferEnabled] = useState(false)
  const [transferSaving, setTransferSaving] = useState(false)

  const saveTransfer = async (val: boolean) => {
    setTransferSaving(true)
    const r = await fetch('/api/platform/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transferEnabled: val }) })
    setTransferSaving(false)
    if (r.ok) setTransferEnabled(val)
    else { const d = await r.json().catch(() => ({})); toast.error(d.error ?? '儲存失敗') }
  }

  const authed = (r: Response) => { if (r.status === 401) { router.replace('/platform/login'); return false }; return true }

  const onLogoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // 允許重選同一張
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('請選擇圖片檔'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('圖片請小於 5MB'); return }
    setLogoBusy(true)
    try {
      const dataUrl = await resizeImage(file, 256)
      setS(p => ({ ...p, logoUrl: dataUrl }))
    } catch { toast.error('圖片處理失敗，請換一張試試') }
    setLogoBusy(false)
  }

  useEffect(() => {
    fetch('/api/platform/settings').then(r => authed(r) ? r.json() : null).then(d => { if (d) {
      setS({
        brandName: d.settings.brandName ?? '', logoUrl: d.settings.logoUrl ?? '', primaryColor: d.settings.primaryColor ?? '#635BFF',
        lineOaUrl: d.settings.lineOaUrl ?? '', liffId: d.settings.liffId ?? '', domain: d.settings.domain ?? '',
        lineChannelToken: d.settings.lineChannelToken ?? '', benefitMarkupRate: String(d.settings.benefitMarkupRate ?? 1.5),
      })
      setTransferEnabled(!!d.settings.transferEnabled)
    } })
    fetch('/api/platform/payment-config').then(r => r.json()).then(d => setPay({
      partnerKey: d.partnerKey ?? '', appId: d.appId ?? '', appKey: d.appKey ?? '', env: d.env ?? 'sandbox',
      creditMerchantId: d.credit?.merchantId ?? '', linePayMerchantId: d.linePay?.merchantId ?? '',
      creditActive: d.credit?.isActive ?? true, linePayActive: d.linePay?.isActive ?? true,
    })).catch(() => {})
    fetch('/api/platform/esim-config').then(r => r.json()).then(d => { const c = d.config; setEsim({ apiUrl: c?.apiUrl || 'https://tfmshippingsys.fastmove.com.tw', merchantId: c?.merchantId ?? '', deptId: c?.deptId ?? '', token: c?.token ?? '' }) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSettings = async (fields: string[], setSaving: (b: boolean) => void, setMsg: (m: string | null) => void) => {
    setSaving(true); setMsg(null)
    const body: Record<string, unknown> = {}
    for (const f of fields) body[f] = f === 'benefitMarkupRate' ? Number(s[f]) : s[f]
    const r = await fetch('/api/platform/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (r.ok) setMsg('已儲存 ✓'); else { const d = await r.json().catch(() => ({})); setMsg(null); toast.error(d.error ?? '儲存失敗') }
  }

  const savePay = async () => {
    setPaySaving(true); setPayMsg(null)
    const r = await fetch('/api/platform/payment-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partnerKey: pay.partnerKey, appId: pay.appId, appKey: pay.appKey, env: pay.env,
        creditMerchantId: pay.creditMerchantId, linePayMerchantId: pay.linePayMerchantId,
        creditActive: pay.creditActive, linePayActive: pay.linePayActive,
      }),
    })
    setPaySaving(false)
    if (r.ok) setPayMsg('已儲存 ✓'); else { const d = await r.json().catch(() => ({})); toast.error(d.error ?? '儲存失敗') }
  }

  const setPayField = (k: string, v: unknown) => setPay(p => ({ ...p, [k]: v }))

  const saveEsim = async () => {
    setEsimSaving(true); setEsimMsg(null)
    const r = await fetch('/api/platform/esim-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(esim) })
    setEsimSaving(false)
    if (r.ok) setEsimMsg('已儲存 ✓'); else { const d = await r.json().catch(() => ({})); toast.error(d.error ?? '儲存失敗') }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-800">系統設定</h1>

      <div className="flex gap-1 border-b border-gray-100 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
        ))}
      </div>

      {tab === '品牌與網域' && (
        <Card title="品牌與網域" onSave={() => saveSettings(['brandName', 'logoUrl', 'primaryColor', 'lineOaUrl', 'liffId', 'domain', 'lineChannelToken'], setSSaving, setSMsg)} saving={sSaving} msg={sMsg}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="品牌名稱"><input className={inputCls} value={s.brandName ?? ''} onChange={e => setS(p => ({ ...p, brandName: e.target.value }))} placeholder="商務通" /></Field>
            <Field label="LIFF ID"><input className={inputCls} value={s.liffId ?? ''} onChange={e => setS(p => ({ ...p, liffId: e.target.value }))} placeholder="1234567890-abcdefgh" /></Field>
            <Field label="Logo 圖片" hint="建議正方形；上傳後自動縮圖儲存">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {s.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.logoUrl} alt="logo" className="w-full h-full object-contain" />
                    : <span className="text-gray-300 text-xs">無</span>}
                </div>
                <div className="flex flex-col gap-1.5 items-start">
                  <label className={`cursor-pointer inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition ${logoBusy ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                    {logoBusy ? '處理中…' : (s.logoUrl ? '更換圖片' : '選擇圖片')}
                    <input type="file" accept="image/*" className="hidden" onChange={onLogoFile} disabled={logoBusy} />
                  </label>
                  {s.logoUrl && <button type="button" onClick={() => setS(p => ({ ...p, logoUrl: '' }))} className="text-xs text-gray-400 hover:text-red-500">移除</button>}
                </div>
              </div>
            </Field>
            <Field label="主題色"><div className="flex items-center gap-2"><input type="color" value={s.primaryColor || '#635BFF'} onChange={e => setS(p => ({ ...p, primaryColor: e.target.value }))} className="w-10 h-9 border border-gray-200 rounded-xl cursor-pointer p-1" /><input className={`${inputCls} font-mono`} value={s.primaryColor ?? ''} onChange={e => setS(p => ({ ...p, primaryColor: e.target.value }))} /></div></Field>
            <Field label="客服 / LINE OA 連結"><input className={inputCls} value={s.lineOaUrl ?? ''} onChange={e => setS(p => ({ ...p, lineOaUrl: e.target.value }))} placeholder="https://lin.ee/…" /></Field>
            <Field label="自訂網域" hint="純 host，如 esim.example.com（DNS 需另於 Vercel 設定）"><input className={inputCls} value={s.domain ?? ''} onChange={e => setS(p => ({ ...p, domain: e.target.value }))} placeholder="esim.example.com" /></Field>
          </div>
          <Field label="LINE Messaging 推播 Token" hint="留空或遮罩＝沿用；用於發送付款/開卡通知（加密儲存）">
            <input className={inputCls} value={s.lineChannelToken ?? ''} onChange={e => setS(p => ({ ...p, lineChannelToken: e.target.value }))} placeholder="****（沿用）或貼上新 token" />
          </Field>
        </Card>
      )}

      {tab === '金流 (TapPay)' && (
        <Card title="TapPay 金流" onSave={savePay} saving={paySaving} msg={payMsg}>
          <p className="text-xs text-gray-400 -mt-1">Partner Key、App ID、App Key、環境 兩種支付共用（只填一次）；Merchant ID 各自填。</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Partner Key" hint="信用卡與 LINE Pay 共用；****＝沿用"><input className={inputCls} value={pay.partnerKey} onChange={e => setPayField('partnerKey', e.target.value)} placeholder="partner_…" /></Field>
            <Field label="環境" hint="測試 / 正式切換"><select className={`${inputCls} bg-white`} value={pay.env} onChange={e => setPayField('env', e.target.value)}><option value="sandbox">sandbox（測試）</option><option value="production">production（正式）</option></select></Field>
            <Field label="App ID (前端 SDK)" hint="共用"><input className={inputCls} value={pay.appId} onChange={e => setPayField('appId', e.target.value)} /></Field>
            <Field label="App Key (前端 SDK)" hint="共用；****＝沿用"><input className={inputCls} value={pay.appKey} onChange={e => setPayField('appKey', e.target.value)} /></Field>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">各支付專屬 Merchant ID</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="信用卡 Merchant ID"><input className={inputCls} value={pay.creditMerchantId} onChange={e => setPayField('creditMerchantId', e.target.value)} /></Field>
              <Field label="LINE Pay Merchant ID"><input className={inputCls} value={pay.linePayMerchantId} onChange={e => setPayField('linePayMerchantId', e.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={pay.creditActive} onChange={e => setPayField('creditActive', e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                前台顯示信用卡
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={pay.linePayActive} onChange={e => setPayField('linePayActive', e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                前台顯示 LINE Pay
              </label>
            </div>
          </div>
        </Card>
      )}

      {tab === 'eSIM (世界移動)' && (
        <Card title="世界移動 eSIM 供應商" onSave={saveEsim} saving={esimSaving} msg={esimMsg}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="API 主機" hint="測試機 tfmshippingsys（自簽 SSL 已處理）／正式機 fmshippingsys">
              <select className={`${inputCls} bg-white`} value={esim.apiUrl} onChange={e => setEsim(p => ({ ...p, apiUrl: e.target.value }))}>
                <option value="https://tfmshippingsys.fastmove.com.tw">測試環境（tfmshippingsys）</option>
                <option value="https://fmshippingsys.fastmove.com.tw">正式環境（fmshippingsys）</option>
                {esim.apiUrl && !['https://tfmshippingsys.fastmove.com.tw', 'https://fmshippingsys.fastmove.com.tw'].includes(esim.apiUrl) && (
                  <option value={esim.apiUrl}>目前設定：{esim.apiUrl}</option>
                )}
              </select>
            </Field>
            <Field label="Merchant ID"><input className={inputCls} value={esim.merchantId ?? ''} onChange={e => setEsim(p => ({ ...p, merchantId: e.target.value }))} /></Field>
            <Field label="Dept ID"><input className={inputCls} value={esim.deptId ?? ''} onChange={e => setEsim(p => ({ ...p, deptId: e.target.value }))} /></Field>
            <Field label="Token" hint="****＝沿用（加密儲存）"><input className={inputCls} value={esim.token ?? ''} onChange={e => setEsim(p => ({ ...p, token: e.target.value }))} /></Field>
          </div>
        </Card>
      )}

      {tab === '福利價' && (
        <Card title="企業福利價倍率" onSave={() => saveSettings(['benefitMarkupRate'], setSSaving, setSMsg)} saving={sSaving} msg={sMsg}>
          <Field label="倍率" hint="福利價 = 成本 × 倍率（1~5，預設 1.5）。新匯入/新增商品時套用；既有商品可於商品管理個別覆寫。">
            <input type="number" min={1} max={5} step={0.1} className={`${inputCls} w-32`} value={s.benefitMarkupRate ?? '1.5'} onChange={e => setS(p => ({ ...p, benefitMarkupRate: e.target.value }))} />
          </Field>
        </Card>
      )}

      {tab === '轉贈' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-3">eSIM 轉贈</h2>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">開啟後，會員可把「已備好、尚未安裝」的 eSIM 透過 LINE 分享／轉贈給好友，好友領取後由對方安裝使用（一張只能一人使用）。關閉則前台不顯示轉贈。</p>
            <button onClick={() => saveTransfer(!transferEnabled)} disabled={transferSaving}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${transferEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${transferEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
