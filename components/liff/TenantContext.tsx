'use client'

import { createContext, useContext, type ReactNode } from 'react'

export type HomeTemplate = 'landmark' | 'gradient' | 'minimal'
export type ProductsTemplate = 'classic' | 'magazine' | 'compact'

export interface TenantConfig {
  id: string
  slug: string
  brandName: string
  liffId: string
  logoUrl: string | null
  primaryColor: string | null
  homeTemplate: HomeTemplate | null
  productsTemplate: ProductsTemplate | null
  lineOaUrl: string | null   // LINE 官方帳號／客服連結（後台設定；前台客服按鈕導向）
}

const TenantContext = createContext<TenantConfig | null>(null)

export function TenantProvider({ children, tenant }: { children: ReactNode; tenant: TenantConfig | null }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
}

export function useTenant(): TenantConfig | null {
  return useContext(TenantContext)
}

// Returns the primary color or the default brand blue
export function usePrimaryColor(): string {
  const tenant = useTenant()
  return tenant?.primaryColor ?? '#0284c7'
}

// ─── Color utilities ────────────────────────────────────────────────────────

type RGB = { r: number; g: number; b: number }

/** Convert #rrggbb (or #rgb) to { r, g, b } */
function hexToRgb(hex: string): RGB | null {
  const full = hex.replace(/^#([a-f\d])([a-f\d])([a-f\d])$/i, '#$1$1$2$2$3$3')
  const m = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(full)
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null
}

function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** WCAG relative luminance (sRGB). */
function luminance({ r, g, b }: RGB): number {
  const ch = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/** WCAG contrast ratio between two colours (1–21). */
function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0, s = 0
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h /= 6
  }
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) { const v = l * 255; return { r: v, g: v, b: v } }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 }
}

const WHITE: RGB = { r: 255, g: 255, b: 255 }
const DARK: RGB = { r: 26, g: 26, b: 26 } // #1a1a1a

/**
 * Pick dark or light text on a coloured *fill* (button background) — whichever
 * has the higher contrast. Light brand colours (e.g. amber) get dark labels.
 */
function onColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  return contrastRatio(rgb, WHITE) >= contrastRatio(rgb, DARK) ? '#ffffff' : '#1a1a1a'
}

/**
 * A version of the brand colour that is always legible as TEXT/icon on white.
 * Keeps the brand hue but darkens light colours (amber, lime, cyan…) until they
 * reach WCAG AA (4.5:1). Already-dark colours pass through unchanged. Use this
 * for headings/amounts/labels; keep `primary` for solid fills where `onPrimary`
 * handles the label. This is why a vivid theme can stay vivid yet readable.
 */
function readableAccent(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#1a1a1a'
  if (contrastRatio(rgb, WHITE) >= 4.5) return hex // already legible → stay vivid
  const { h, s } = rgbToHsl(rgb)
  const sat = Math.min(1, s + 0.04) // nudge saturation so the darkened tone stays vivid, not muddy
  for (let l = 0.46; l >= 0.12; l -= 0.02) {
    const cand = hslToRgb(h, sat, l)
    if (contrastRatio(cand, WHITE) >= 4.5) return rgbToHex(cand)
  }
  return '#1a1a1a'
}

/**
 * Full colour palette derived from the tenant's primary colour.
 *
 * primary     — raw brand colour           → CTA button / badge / active-tab FILLS, indicators
 * primaryText — contrast-safe brand colour → headings, amounts, labels, icons on light bg
 * onPrimary   — text on a primary fill      → button labels (auto white or dark)
 * light       — 8 % tint                   → selected card / item backgrounds
 * soft        — 14 % tint                  → hover states, chip backgrounds
 * border      — 28 % tint                  → borders on selected/active items
 * muted       — 50 % tint                  → minor decorative accents (not body text)
 */
export interface TenantColors {
  primary: string
  primaryText: string
  onPrimary: string
  light: string
  soft: string
  border: string
  muted: string
}

export function useTenantColors(): TenantColors {
  const primary = usePrimaryColor()
  const rgb = hexToRgb(primary)
  const a = (opacity: number): string =>
    rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})` : primary

  return {
    primary,
    primaryText: readableAccent(primary),
    onPrimary: onColor(primary),
    light:  a(0.08),
    soft:   a(0.14),
    border: a(0.28),
    muted:  a(0.50),
  }
}
