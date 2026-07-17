'use client'

import { useEffect, useState } from 'react'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'

type GroupSettings = {
  name: string
  description: string | null
  rebateRate: number
  rebateCeiling?: number
  bankName: string | null
  bankBranch: string | null
  bankAccount: string | null
  bankHolderName: string | null
}

export default function GroupAdminSettingsPage() {
  const C = useTenantColors()
  const [settings, setSettings] = useState<GroupSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [rebateRate, setRebateRate] = useState('0')
  const [rebateCeiling, setRebateCeiling] = useState(30)   // 讓利上限（%），跟租戶 maxRebateRate 走
  const [description, setDescription] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankBranch, setBankBranch] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankHolderName, setBankHolderName] = useState('')

  useEffect(() => {
    fetch('/api/groups').then(r => r.json()).then(d => {
      const g = d.ownedGroup
      if (g) {
        setSettings(g)
        setRebateRate(String(Math.round(Number(g.rebateRate) * 100)))
        if (g.rebateCeiling != null) setRebateCeiling(Math.round(Number(g.rebateCeiling) * 100))
        setDescription(g.description ?? '')
        setBankName(g.bankName ?? '')
        setBankBranch(g.bankBranch ?? '')
        setBankAccount(g.bankAccount ?? '')
        setBankHolderName(g.bankHolderName ?? '')
      }
    }).finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    const r = await fetch('/api/groups/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rebateRate: parseFloat(rebateRate) / 100,
        description,
        bankName,
        bankBranch,
        bankAccount,
        bankHolderName,
      }),
    }).then(x => x.json())
    setSaving(false)
    setMsg(r.group ? '✅ 設定已儲存' : `❌ ${r.error}`)
  }

  if (loading) return <div className="px-4 py-5"><PageSkeleton rows={5} /></div>
  if (!settings) return <div className="px-4 py-5"><p className="text-gray-500">無法取得社群資訊</p></div>

  return (
    <div className="px-4 py-5 space-y-5 pb-24">
      <h1 className="text-xl font-bold">社群設定</h1>

      {/* 讓利比例 */}
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="font-semibold mb-3">讓利比例設定</h2>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          平台對每筆訂單收取 30% 分配池，其中：
        </p>
        <ul className="text-xs text-gray-500 mb-3 list-disc pl-5 space-y-1">
          <li><strong>讓利比例 → 會員</strong>：發給會員的入群券與回購券折扣</li>
          <li><strong>30% − 讓利比例 → 您</strong>：每筆訂單您的分潤比例</li>
        </ul>
        <p className="text-xs text-gray-400 mb-3">
          讓利越多 → 會員越便宜、您分潤越少。設 0% 時不會發券（沒折扣可給）。
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max={rebateCeiling}
            value={rebateRate}
            onChange={e => setRebateRate(e.target.value)}
            className="flex-1"
          />
          <span className="text-xl font-bold w-16 text-right" style={{ color: C.primaryText }}>{rebateRate}%</span>
        </div>
        {rebateCeiling < 30 && (
          <p className="text-[11px] text-gray-400 mt-2">※ 平台設定讓利上限為 {rebateCeiling}%</p>
        )}
        {(() => {
          const r = parseInt(rebateRate) || 0
          const memberDiscountPct = 100 - r  // 顯示成「X 折」就是 (100-r)/10 折
          // 範例：商品 1000 元
          const samplePaid = Math.round(1000 * memberDiscountPct / 100)
          const sampleCommission = Math.round(1000 * (0.30 - r / 100))
          return (
            <div className="text-xs text-gray-500 mt-3 bg-gray-50 rounded-lg p-3 leading-relaxed">
              {r === 0 ? (
                <p className="font-semibold text-amber-700">當前 0%：不會發優惠券，每筆訂單您拿 30%。</p>
              ) : (
                <>
                  <p className="font-semibold text-gray-700 mb-1">
                    會員入群券 / 回購券：{memberDiscountPct % 10 === 0 ? memberDiscountPct / 10 : memberDiscountPct} 折
                  </p>
                  <p>
                    範例：原價 NT$1,000 商品<br />
                    → 會員實付 <strong>NT${samplePaid.toLocaleString()}</strong>　·　您分潤 <strong>NT${sampleCommission.toLocaleString()}</strong>
                  </p>
                </>
              )}
              <p className="text-gray-400 mt-1 text-[11px]">※ 調整後僅影響新發出的券，既有未使用券不變</p>
            </div>
          )
        })()}
      </div>

      {/* 社群簡介 */}
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="font-semibold mb-2">社群簡介</h2>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* 銀行帳戶 */}
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="font-semibold mb-3">提領銀行帳戶</h2>
        {[
          { label: '銀行名稱', value: bankName, set: setBankName },
          { label: '分行', value: bankBranch, set: setBankBranch },
          { label: '帳號', value: bankAccount, set: setBankAccount },
          { label: '戶名', value: bankHolderName, set: setBankHolderName },
        ].map(f => (
          <div key={f.label} className="mb-3">
            <label className="text-sm text-gray-600 block mb-1">{f.label}</label>
            <input
              value={f.value}
              onChange={e => f.set(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        <p className="text-xs text-gray-400 leading-relaxed">
          🔒 帳號為機密資料，這裡只顯示末 4 碼；完整帳號僅平台方在撥款時可見。要更改請直接輸入新的完整帳號後儲存。
        </p>
      </div>

      {msg && <p className="text-sm text-center">{msg}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl font-semibold disabled:opacity-50"
        style={{ background: C.primary, color: C.onPrimary }}
      >
        {saving ? '儲存中…' : '儲存設定'}
      </button>
    </div>
  )
}
