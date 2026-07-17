'use client'

import { useEffect, useRef, useState } from 'react'
import { useTenantColors } from '@/components/liff/TenantContext'

export interface DayPickerProps {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Quick preset chips shown beneath the stepper. Pass empty array to hide. */
  presets?: number[]
  label?: string
  /** Optional sub-label shown under the number (e.g. "找到 12 個方案"). */
  caption?: string
  /** Compact mode: smaller font, less padding. */
  compact?: boolean
}

function MinusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export default function DayPicker({
  value,
  onChange,
  min = 1,
  max = 60,
  presets = [1, 3, 5, 7, 14, 30],
  label = '天數',
  caption,
  compact = false,
}: DayPickerProps) {
  const C = useTenantColors()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const canDec = value > min
  const canInc = value < max

  const dec = () => { if (canDec) { onChange(clamp(value - 1)); haptic() } }
  const inc = () => { if (canInc) { onChange(clamp(value + 1)); haptic() } }

  const commit = () => {
    const cleaned = draft.replace(/\D/g, '')
    const n = cleaned ? Number(cleaned) : min
    onChange(clamp(n))
    setEditing(false)
  }

  const numberSize = compact ? 32 : 42
  const btnSize = compact ? 38 : 44

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid rgba(0,0,0,0.07)',
      padding: compact ? '14px 16px' : '18px 20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {label && (
        <p style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#94a3b8',
          letterSpacing: '0.08em',
          margin: '0 0 10px',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}>{label}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: compact ? 18 : 22 }}>
        {/* − */}
        <button
          type="button"
          onClick={dec}
          disabled={!canDec}
          aria-label="減少天數"
          style={{
            width: btnSize, height: btnSize, borderRadius: '50%',
            border: `1.5px solid ${canDec ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)'}`,
            background: '#fff',
            color: canDec ? '#1a1a1a' : '#d1d5db',
            cursor: canDec ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s, transform 0.08s',
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)' }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        >
          <MinusIcon size={compact ? 16 : 18} />
        </button>

        {/* Number / Input */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 110, justifyContent: 'center' }}>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft}
              onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commit() }
                if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) }
              }}
              style={{
                width: 80,
                fontSize: numberSize,
                fontWeight: 800,
                color: C.primary,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${C.primary}`,
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '-0.04em',
                padding: 0,
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="輸入天數"
              style={{
                fontSize: numberSize,
                fontWeight: 800,
                color: '#1a1a1a',
                background: 'transparent',
                border: 'none',
                cursor: 'text',
                padding: '2px 6px',
                letterSpacing: '-0.04em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {value}
            </button>
          )}
          <span style={{ fontSize: compact ? 14 : 16, color: '#64748b', fontWeight: 500 }}>天</span>
        </div>

        {/* + */}
        <button
          type="button"
          onClick={inc}
          disabled={!canInc}
          aria-label="增加天數"
          style={{
            width: btnSize, height: btnSize, borderRadius: '50%',
            border: 'none',
            background: canInc ? C.primary : 'rgba(0,0,0,0.08)',
            color: canInc ? C.onPrimary : '#9ca3af',
            cursor: canInc ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.12s, transform 0.08s',
            boxShadow: canInc ? `0 3px 10px ${C.primary}44` : 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.92)' }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        >
          <PlusIcon size={compact ? 16 : 18} />
        </button>
      </div>

      {caption && (
        <p style={{
          fontSize: 12,
          color: '#94a3b8',
          margin: '8px 0 0',
          textAlign: 'center',
        }}>{caption}</p>
      )}

      {presets.length > 0 && (
        <div style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(presets.length, 6)}, 1fr)`,
          gap: 6,
        }}>
          {presets.slice(0, 6).map(p => {
            const active = value === p
            const disabled = p < min || p > max
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => { onChange(clamp(p)); haptic() }}
                style={{
                  padding: '8px 0',
                  borderRadius: 100,
                  border: active ? `1.5px solid ${C.primary}` : '1.5px solid rgba(0,0,0,0.08)',
                  background: active ? C.primary : '#fff',
                  color: active ? C.onPrimary : (disabled ? '#cbd5e1' : '#4b5563'),
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {p} 天
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { (navigator as Navigator & { vibrate: (p: number) => void }).vibrate(8) } catch {}
  }
}
