'use client'

// 後台輕量 toast：取代散落各頁、突兀的 window.alert。
// 用極簡 pub/sub singleton，任何地方（含 async function、非元件）都能直接 toast.error(...)。
// <Toaster /> 掛在 platform layout 一次即可。

import { useEffect, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'
type Item = { id: number; kind: Kind; text: string }

let items: Item[] = []
let seq = 0
const listeners = new Set<(v: Item[]) => void>()
const emit = () => { for (const l of listeners) l(items) }

function remove(id: number) { items = items.filter(t => t.id !== id); emit() }
function push(kind: Kind, text: string) {
  const id = ++seq
  items = [...items, { id, kind, text }]
  emit()
  window.setTimeout(() => remove(id), kind === 'error' ? 5000 : 3000)
}

export const toast = {
  success: (text: string) => push('success', text),
  error:   (text: string) => push('error', text),
  info:    (text: string) => push('info', text),
}

const ICON: Record<Kind, { node: ReactNode; cls: string }> = {
  success: {
    cls: 'text-green-600',
    node: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  error: {
    cls: 'text-red-500',
    node: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>,
  },
  info: {
    cls: 'text-blue-600',
    node: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
}

function ToastCard({ item }: { item: Item }) {
  const ic = ICON[item.kind]
  return (
    <div className="flex items-start gap-3 bg-white rounded-xl shadow-lg ring-1 ring-black/5 px-4 py-3" style={{ animation: 'platformToastIn .2s ease-out' }}>
      <span className={`mt-0.5 flex-shrink-0 ${ic.cls}`}>{ic.node}</span>
      <p className="flex-1 text-sm text-gray-700 leading-snug break-words">{item.text}</p>
      <button onClick={() => remove(item.id)} aria-label="關閉" className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  )
}

export function Toaster() {
  const [list, setList] = useState<Item[]>([])
  useEffect(() => { listeners.add(setList); setList(items); return () => { listeners.delete(setList) } }, [])
  if (list.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2.5rem)]">
      {list.map(t => <ToastCard key={t.id} item={t} />)}
      <style>{`@keyframes platformToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </div>
  )
}
