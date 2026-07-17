'use client'

import { type CSSProperties } from 'react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

export interface NetworkSupport {
  has5G: boolean
  has4G: boolean
  has3G: boolean
  /** Raw label suitable for display (e.g. "5G · 4G", "5G"). Empty if unknown. */
  label: string
}

const G_RE = /(5G|LTE|4G|3G|2G)/gi

export function parseNetworkType(raw: string | null | undefined): NetworkSupport {
  if (!raw) return { has5G: false, has4G: false, has3G: false, label: '' }
  const tokens = new Set<string>()
  for (const m of raw.matchAll(G_RE)) {
    const t = m[1].toUpperCase()
    tokens.add(t === 'LTE' ? '4G' : t)
  }
  const has5G = tokens.has('5G')
  const has4G = tokens.has('4G')
  const has3G = tokens.has('3G')
  const labelParts: string[] = []
  if (has5G) labelParts.push('5G')
  if (has4G) labelParts.push('4G')
  if (!has5G && !has4G && has3G) labelParts.push('3G')
  return { has5G, has4G, has3G, label: labelParts.join(' · ') }
}

// ─── Tiny components ─────────────────────────────────────────────────────────

function SignalIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="2"  y="14" width="3" height="6" rx="1" />
      <rect x="7"  y="10" width="3" height="10" rx="1" />
      <rect x="12" y="6"  width="3" height="14" rx="1" />
      <rect x="17" y="2"  width="3" height="18" rx="1" />
    </svg>
  )
}

interface BaseBadgeProps {
  size?: 'sm' | 'md'
  style?: CSSProperties
}

interface NetworkBadgeProps extends BaseBadgeProps {
  networkType: string | null | undefined
}

/**
 * 5G/4G/3G capability badge. Renders nothing if `networkType` is empty or
 * unparseable. Green for 5G, slate for 4G, gray for 3G.
 */
export function NetworkBadge({ networkType, size = 'sm', style }: NetworkBadgeProps) {
  const n = parseNetworkType(networkType)
  if (!n.label) return null
  const palette = n.has5G
    ? { bg: '#dcfce7', fg: '#14532d', dot: '#16a34a' }
    : n.has4G
      ? { bg: '#eef2ff', fg: '#3730a3', dot: '#4f46e5' }
      : { bg: '#f1f5f9', fg: '#475569', dot: '#64748b' }

  const sm = size === 'sm'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: palette.bg, color: palette.fg,
      borderRadius: 6,
      padding: sm ? '2px 7px' : '3px 9px',
      fontSize: sm ? 11 : 12,
      fontWeight: 700,
      letterSpacing: '0.04em',
      lineHeight: 1.2,
      ...style,
    }}>
      <span style={{ display: 'inline-flex', color: palette.dot }}>
        <SignalIcon size={sm ? 10 : 12} />
      </span>
      {n.label}
    </span>
  )
}

interface NativeSimBadgeProps extends BaseBadgeProps {
  isNative: boolean | null | undefined
}

/**
 * "原生 SIM" pill — surfaces the higher-quality non-roaming plans.
 * Renders nothing if `isNative` isn't truthy.
 */
export function NativeSimBadge({ isNative, size = 'sm', style }: NativeSimBadgeProps) {
  if (!isNative) return null
  const sm = size === 'sm'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: '#fef3c7', color: '#92400e',
      borderRadius: 6,
      padding: sm ? '2px 7px' : '3px 9px',
      fontSize: sm ? 11 : 12,
      fontWeight: 700,
      letterSpacing: '0.04em',
      lineHeight: 1.2,
      ...style,
    }}>
      <svg width={sm ? 10 : 12} height={sm ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2l3 6 6 1-4.5 4.5L18 21l-6-3.5L6 21l1.5-7.5L3 9l6-1z" />
      </svg>
      原生
    </span>
  )
}
