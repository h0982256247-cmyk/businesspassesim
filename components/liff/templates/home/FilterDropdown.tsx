'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  label: string
  options: string[]
  value: string | null
  onChange: (v: string | null) => void
  primary: string
  dark?: boolean
}

export default function FilterDropdown({ label, options, value, onChange, primary, dark = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 點外部關閉
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = value !== null
  const borderColor = selected ? primary : dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'
  const bg         = selected ? primary : dark ? 'rgba(255,255,255,0.07)' : '#fff'
  const textColor  = selected ? '#fff'  : dark ? 'rgba(255,255,255,0.7)' : '#374151'

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 20,
          background: bg, border: `1.5px solid ${borderColor}`,
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: textColor, whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        {selected ? value : label}
        {selected ? (
          // Clear × 按鈕
          <span
            onClick={e => { e.stopPropagation(); onChange(null); setOpen(false) }}
            style={{ fontSize: 12, opacity: 0.75, lineHeight: 1 }}
          >✕</span>
        ) : (
          <svg
            width="11" height="11" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}
          >
            <polyline points="2 4 6 8 10 4"/>
          </svg>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          background: dark ? '#1a1a2e' : '#fff',
          borderRadius: 14,
          border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          overflow: 'hidden', minWidth: 110,
          animation: 'ddOpen 0.14s cubic-bezier(0.16,1,0.3,1)',
        }}>
          {options.map((opt, i) => (
            <button
              key={opt}
              onClick={() => { onChange(opt === value ? null : opt); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                padding: '11px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: opt === value ? primary : dark ? 'rgba(255,255,255,0.8)' : '#374151',
                borderBottom: i < options.length - 1
                  ? `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              {opt}
              {opt === value && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes ddOpen { from{opacity:0;transform:translateY(-4px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>
    </div>
  )
}
