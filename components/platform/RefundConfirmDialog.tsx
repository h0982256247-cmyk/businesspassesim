'use client'

import { useState } from 'react'

// 退款預覽（由 GET /api/platform/orders/:id 回傳；?scope=bundle 為整捆範圍）
export type RefundPreview = { restore: number; voidUnused: number; usedElsewhere: number }

export type RefundTarget = {
  id: string                       // 呼叫 API 用的訂單 id（整捆退傳任一捆內 id 即可）
  orderNumber: string | null
  status: string
  scope: 'single' | 'bundle'       // single = 單張部分退款；bundle = 整捆全退
  amount: number                   // 退款金額（單張＝該張實付；整捆＝可退張數合計）
  count: number                    // 退款的 eSIM 張數
  restoresCoupons: boolean         // 本次退款是否會退還／作廢優惠券（只有全退才會）
  preview: RefundPreview | null
}

// 依訂單狀態給不同提醒（取代原本散落兩處、文案不一致的 window.confirm）
const STATUS_WARN: Record<string, string> = {
  COMPLETED:    '已完成發送的 eSIM，會員已取得兌換碼。供應商成本無法回收、需平台自行吸收；社群主已產生的分潤將自動扣抵。',
  ESIM_PENDING: 'eSIM 尚未交付。請主動向供應商（世界移動）確認是否已計費，若已計費需平台自行吸收。',
  PAID:         'eSIM 開卡流程已啟動，供應商成本可能已產生。',
}

function Dot() {
  return <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
}

export default function RefundConfirmDialog({
  target, onClose, onConfirm,
}: {
  target: RefundTarget | null
  onClose: () => void
  onConfirm: (target: RefundTarget) => Promise<{ ok: boolean; message: string }>
}) {
  const [phase, setPhase] = useState<'confirm' | 'loading' | 'done'>('confirm')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  if (!target) return null

  const warn = STATUS_WARN[target.status]
  const p = target.preview
  const isBundle = target.scope === 'bundle'
  const countTxt = target.count > 1 ? ` ${target.count} 張` : ''

  const confirm = async () => {
    setPhase('loading')
    const r = await onConfirm(target)
    setResult(r)
    setPhase('done')
  }
  const close = () => {
    if (phase === 'loading') return
    setPhase('confirm')
    setResult(null)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {phase !== 'done' ? (
          <div className="p-6">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m0 0H9.5M15 8v5.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-gray-900">{isBundle ? '整捆退款' : '退款訂單'}</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              {target.orderNumber ?? `#${target.id.slice(-8).toUpperCase()}`}
              {isBundle && target.count > 1 ? ` · 共 ${target.count} 張 eSIM` : ''}
            </p>

            <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3.5 flex items-baseline justify-between">
              <span className="text-sm text-gray-500">退還金額{isBundle && target.count > 1 ? `（${target.count} 張合計）` : ''}</span>
              <span className="text-2xl font-extrabold text-gray-900">NT${target.amount.toLocaleString()}</span>
            </div>

            <p className="mt-5 text-xs font-semibold text-gray-400 tracking-wide">退款將同步執行</p>
            <ul className="mt-2 space-y-2 text-sm text-gray-600">
              <li className="flex gap-2.5"><Dot />透過 TapPay 原路退回款項給會員</li>
              <li className="flex gap-2.5"><Dot />取消這{countTxt} eSIM 的社群主分潤</li>
              {target.restoresCoupons ? (
                <>
                  {p && p.restore > 0 && (
                    <li className="flex gap-2.5"><Dot />退還使用的 <b className="font-semibold text-gray-800">{p.restore}</b> 張優惠券給會員（過期者延長 14 天）</li>
                  )}
                  {p && p.voidUnused > 0 && (
                    <li className="flex gap-2.5"><Dot />作廢發出、尚未使用的回購券 <b className="font-semibold text-gray-800">{p.voidUnused}</b> 張</li>
                  )}
                  {(!p || (p.restore === 0 && p.voidUnused === 0)) && (
                    <li className="flex gap-2.5"><Dot />此訂單無使用優惠券，亦無發出回購券</li>
                  )}
                </>
              ) : (
                <li className="flex gap-2.5"><Dot /><span className="text-gray-500">單張退款<b className="text-gray-700">不退還優惠券</b>（需整捆全退才退券）</span></li>
              )}
            </ul>

            {warn && (
              <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3">
                <p className="text-xs font-semibold text-amber-800 mb-0.5">請留意</p>
                <p className="text-xs leading-relaxed text-amber-700">{warn}</p>
              </div>
            )}

            {target.restoresCoupons && p && p.usedElsewhere > 0 && (
              <div className="mt-3 rounded-2xl bg-red-50 border border-red-200 px-3.5 py-3">
                <p className="text-xs font-semibold text-red-700 mb-0.5">回購券已被使用，無法自動追回</p>
                <p className="text-xs leading-relaxed text-red-600">
                  發出的回購券已有 <b>{p.usedElsewhere}</b> 張被用於其他訂單，退款後該筆折扣不會自動扣回，請視情況另行處理。
                </p>
              </div>
            )}

            <div className="mt-6 flex gap-2.5">
              <button
                onClick={close}
                disabled={phase === 'loading'}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition"
              >
                取消
              </button>
              <button
                onClick={confirm}
                disabled={phase === 'loading'}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition"
              >
                {phase === 'loading' ? '退款中…' : isBundle ? '確定整捆退款' : '確定退款'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center ${result?.ok ? 'bg-green-50' : 'bg-red-50'}`}>
              {result?.ok ? (
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <p className={`mt-3 text-base font-bold ${result?.ok ? 'text-gray-900' : 'text-red-600'}`}>
              {result?.ok ? '退款完成' : '退款失敗'}
            </p>
            <p className="mt-1 text-sm text-gray-500 whitespace-pre-line">{result?.message}</p>
            <button
              onClick={close}
              className="mt-5 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition"
            >
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
