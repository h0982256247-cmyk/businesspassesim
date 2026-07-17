'use client'

import { useEffect } from 'react'

// 輕量非阻斷提示。取代 alert()（原生 alert 在 LINE 內建瀏覽器會露出網域、且阻斷操作）。
// 由父層持有 toast 狀態，設值即顯示，數秒後自動消失。
export interface ToastProps {
  message: string | null
  tone?: 'success' | 'error' | 'info'
  /** 自動關閉時呼叫（請用 useCallback 包成穩定參考）。 */
  onDone: () => void
}

export default function Toast({ message, tone = 'info', onDone }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [message, onDone])

  if (!message) return null
  const bg = tone === 'error' ? '#dc2626' : tone === 'success' ? '#16a34a' : '#0f172a'
  return (
    <div
      style={{
        position: 'fixed', left: '50%', zIndex: 1100,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)',
        transform: 'translateX(-50%)',
        background: bg, color: '#fff', fontSize: 14, fontWeight: 600,
        padding: '12px 18px', borderRadius: 100,
        boxShadow: '0 8px 24px rgba(15,23,42,0.3)',
        maxWidth: '88vw', textAlign: 'center', lineHeight: 1.4,
        animation: 'toastIn 0.2s ease',
      }}
    >
      {message}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
    </div>
  )
}
