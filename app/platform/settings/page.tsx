'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

const TABS = ['品牌與網域', '金流 (TapPay)', 'eSIM (世界移動)', '福利價'] as const
type Tab = typeof TABS[number]

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400'

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
  // 金流
  const [pay, setPay] = useState<{ credit: Record<string, unknown> | null; linepay: Record<string, unknown> | null }>({ credit: null, linepay: null })
  const [paySaving, setPaySaving] = useState<string | null>(null)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  // eSIM
  const [esim, setEsim] = useState<Record<string, string>>({})
  const [esimSaving, setEsimSaving] = useState(false)
  const [esimMsg, setEsimMsg] = useState<string | null>(null)

  const authed = (r: Response) => { if (r.status === 401) { router.replace('/platform/login'); return false }; return true }

  useEffect(() => {
    fetch('/api/platform/settings').then(r => authed(r) ? r.json() : null).then(d => { if (d) setS({
      brandName: d.settings.brandName ?? '', logoUrl: d.settings.logoUrl ?? '', primaryColor: d.settings.primaryColor ?? '#635BFF',
      lineOaUrl: d.settings.lineOaUrl ?? '', liffId: d.settings.liffId ?? '', domain: d.settings.domain ?? '',
      lineChannelToken: d.settings.lineChannelToken ?? '', benefitMarkupRate: String(d.settings.benefitMarkupRate ?? 1.5),
    }) })
    fetch('/api/platform/payment-config').then(r => r.json()).then(d => setPay({ credit: d.credit, linepay: d.linepay })).catch(() => {})
    fetch('/api/platform/esim-config').then(r => r.json()).then(d => { const c = d.config; setEsim({ apiUrl: c?.apiUrl ?? '', merchantId: c?.merchantId ?? '', deptId: c?.deptId ?? '', token: c?.token ?? '' }) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSettings = async (fields: string[], setSaving: (b: boolean) => void, setMsg: (m: string | null) => void) => {
    setSaving(true); setMsg(null)
    const body: Record<string, unknown> = {}
    for (const f of fields) body[f] = f === 'benefitMarkupRate' ? Number(s[f]) : s[f]
    const r = await fetch('/api/platform/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false)
    if (r.ok) setMsg('已儲存 ✓'); else { const d = await r.json().catch(() => ({})); setMsg(null); alert(d.error ?? '儲存失敗') }
  }

  const savePay = async (gateway: 'tappay_credit' | 'tappay_linepay') => {
    const c = (gateway === 'tappay_credit' ? pay.credit : pay.linepay) ?? {}
    setPaySaving(gateway); setPayMsg(null)
    const r = await fetch('/api/platform/payment-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway, partnerKey: c.partnerKey ?? '', merchantId: c.merchantId ?? '', env: c.env ?? 'sandbox', appId: c.appId ?? '', appKey: c.appKey ?? '' }),
    })
    setPaySaving(null)
    if (r.ok) setPayMsg('已儲存 ✓'); else { const d = await r.json().catch(() => ({})); alert(d.error ?? '儲存失敗') }
  }

  const setPayField = (gw: 'credit' | 'linepay', k: string, v: unknown) =>
    setPay(p => ({ ...p, [gw]: { ...(p[gw] ?? {}), [k]: v } }))

  const saveEsim = async () => {
    setEsimSaving(true); setEsimMsg(null)
    const r = await fetch('/api/platform/esim-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(esim) })
    setEsimSaving(false)
    if (r.ok) setEsimMsg('已儲存 ✓'); else { const d = await r.json().catch(() => ({})); alert(d.error ?? '儲存失敗') }
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
            <Field label="Logo 網址"><input className={inputCls} value={s.logoUrl ?? ''} onChange={e => setS(p => ({ ...p, logoUrl: e.target.value }))} placeholder="https://…" /></Field>
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
        <div className="space-y-4">
          {(['credit', 'linepay'] as const).map(gw => {
            const c = (pay[gw] ?? {}) as Record<string, unknown>
            const gwName = gw === 'credit' ? '信用卡' : 'LINE Pay'
            const gateway = gw === 'credit' ? 'tappay_credit' : 'tappay_linepay'
            return (
              <Card key={gw} title={`TapPay ${gwName}`} onSave={() => savePay(gateway)} saving={paySaving === gateway} msg={paySaving === null ? payMsg : null}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Partner Key" hint="****＝沿用"><input className={inputCls} value={(c.partnerKey as string) ?? ''} onChange={e => setPayField(gw, 'partnerKey', e.target.value)} placeholder="partner_…" /></Field>
                  <Field label="Merchant ID"><input className={inputCls} value={(c.merchantId as string) ?? ''} onChange={e => setPayField(gw, 'merchantId', e.target.value)} /></Field>
                  <Field label="App ID (前端 SDK)"><input className={inputCls} value={(c.appId as string) ?? ''} onChange={e => setPayField(gw, 'appId', e.target.value)} /></Field>
                  <Field label="App Key (前端 SDK)" hint="****＝沿用"><input className={inputCls} value={(c.appKey as string) ?? ''} onChange={e => setPayField(gw, 'appKey', e.target.value)} /></Field>
                  <Field label="環境"><select className={`${inputCls} bg-white`} value={(c.env as string) ?? 'sandbox'} onChange={e => setPayField(gw, 'env', e.target.value)}><option value="sandbox">sandbox（測試）</option><option value="production">production（正式）</option></select></Field>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'eSIM (世界移動)' && (
        <Card title="世界移動 eSIM 供應商" onSave={saveEsim} saving={esimSaving} msg={esimMsg}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="API 主機" hint="測試機含 tfmshippingsys；正式機為 fmshippingsys"><input className={inputCls} value={esim.apiUrl ?? ''} onChange={e => setEsim(p => ({ ...p, apiUrl: e.target.value }))} placeholder="https://…" /></Field>
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
    </div>
  )
}
