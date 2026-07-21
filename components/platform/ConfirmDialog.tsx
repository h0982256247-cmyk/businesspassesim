'use client'

// 後台通用確認框：取代原生 window.confirm。
// 用 promise 介面讓呼叫點改動最小 —— 原本 `if (!window.confirm(msg)) return`
// 直接換成 `if (!(await confirmDialog({ title, message }))) return`。
// <ConfirmHost /> 掛在 platform layout 一次即可。

import { useEffect, useState } from 'react'

type Opts = {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'danger'
}
type Req = Opts & { resolve: (ok: boolean) => void }

let current: Req | null = null
const listeners = new Set<(v: Req | null) => void>()
const emit = () => { for (const l of listeners) l(current) }

export function confirmDialog(opts: Opts): Promise<boolean> {
  return new Promise(resolve => {
    // 若前一個尚未回應就被新的取代，視為取消，避免 promise 洩漏
    if (current) current.resolve(false)
    current = { ...opts, resolve }
    emit()
  })
}
function settle(ok: boolean) {
  current?.resolve(ok)
  current = null
  emit()
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null)
  useEffect(() => { listeners.add(setReq); setReq(current); return () => { listeners.delete(setReq) } }, [])
  if (!req) return null
  const danger = req.tone === 'danger'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm" onClick={() => settle(false)}>
      <div className="bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-lg font-bold text-gray-900">{req.title}</h2>
          {req.message && <p className="mt-2 text-sm text-gray-500 whitespace-pre-line leading-relaxed">{req.message}</p>}
          <div className="mt-6 flex gap-2.5">
            <button onClick={() => settle(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
              {req.cancelText ?? '取消'}
            </button>
            <button onClick={() => settle(true)} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {req.confirmText ?? '確定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
