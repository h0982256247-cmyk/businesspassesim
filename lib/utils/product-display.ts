/**
 * Shared helpers for rendering product plans across LIFF templates.
 *
 * The data model is messy on purpose — `dataCapacity` is a free-form string
 * like "3GB", "1GB/天", "500MB/天", "無限". These helpers normalize it so
 * the UI can sort, group, and badge consistently.
 */

export type DataTier = 'light' | 'standard' | 'medium' | 'heavy' | 'unlimited' | 'titanium' | 'highspeed' | 'unknown'

export interface PlanLike {
  id: string
  displayDays: number
  dataCapacity: string | null
  sellPrice: number
  networkType?: string | null
  isNativeSim?: boolean
}

export interface PlanDisplay<T extends PlanLike> {
  plan: T
  /** Total GB across the whole plan (perDay × days, or just total). */
  totalGB: number
  /** GB per day. */
  perDayGB: number
  /** Whether the original capacity string was per-day. */
  isPerDay: boolean
  /** Whether this looks like an unlimited plan. */
  isUnlimited: boolean
  /** NT$ cost per day (sellPrice / displayDays, rounded). */
  perDayCost: number
  /** Coarse tier for grouping / color coding. */
  tier: DataTier
}

const UNLIMITED_TOKENS = ['無限', 'unlimited', 'unlimit', '吃到飽', 'max', 'hsd']

export function parseDataCapacity(raw: string | null): { totalGB: number; isPerDay: boolean; isUnlimited: boolean } {
  if (!raw) return { totalGB: 0, isPerDay: false, isUnlimited: false }
  const lower = raw.toLowerCase()
  const isUnlimited = UNLIMITED_TOKENS.some(t => lower.includes(t))
  const isPerDay = /\/(天|日|day)/i.test(raw)
  if (isUnlimited) return { totalGB: 0, isPerDay, isUnlimited: true }

  const m = raw.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)/i)
  if (!m) return { totalGB: 0, isPerDay, isUnlimited: false }
  const num = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  const gb = unit === 'TB' ? num * 1000 : unit === 'MB' ? num / 1024 : num
  return { totalGB: gb, isPerDay, isUnlimited: false }
}

// 吃到飽家族再細分：鈦金（TI）/ 高速（HSD）/ 一般吃到飽，
// 讓前台用不同顏色＋可分別篩選。判斷依 dataCapacity 原字串（鈦金吃到飽 / 高速吃到飽 / 吃到飽）。
function unlimitedSubTier(raw: string): DataTier {
  if (/鈦金/.test(raw) || /(?<![A-Za-z])TI(?![A-Za-z])/i.test(raw))  return 'titanium'
  if (/高速/.test(raw) || /(?<![A-Za-z])HSD(?![A-Za-z])/i.test(raw)) return 'highspeed'
  return 'unlimited'
}

export function classifyTier(perDayGB: number, isUnlimited: boolean, raw?: string | null): DataTier {
  if (isUnlimited) return unlimitedSubTier(raw ?? '')
  if (perDayGB <= 0) return 'unknown'
  if (perDayGB < 1) return 'light'
  if (perDayGB < 3) return 'standard'
  if (perDayGB < 10) return 'medium'
  return 'heavy'
}

export const TIER_LABEL: Record<DataTier, string> = {
  light:     '輕量',
  standard:  '標準',
  medium:    '進階',
  heavy:     '重度',
  unlimited: '吃到飽',
  titanium:  '鈦金吃到飽',
  highspeed: '高速吃到飽',
  unknown:   '一般',
}

/** Tailwind-ish soft palettes per tier — caller can apply over its own brand. */
export const TIER_COLOR: Record<DataTier, { bg: string; fg: string; accent: string }> = {
  light:     { bg: '#ecfeff', fg: '#0e7490', accent: '#06b6d4' },
  standard:  { bg: '#eff6ff', fg: '#1d4ed8', accent: '#3b82f6' },
  medium:    { bg: '#f5f3ff', fg: '#6d28d9', accent: '#8b5cf6' },
  heavy:     { bg: '#fff7ed', fg: '#c2410c', accent: '#f97316' },
  unlimited: { bg: '#fef2f2', fg: '#b91c1c', accent: '#ef4444' },   // 吃到飽=紅
  titanium:  { bg: '#fefce8', fg: '#a16207', accent: '#ca8a04' },   // 鈦金吃到飽=金
  highspeed: { bg: '#ecfdf5', fg: '#047857', accent: '#059669' },   // 高速吃到飽=綠
  unknown:   { bg: '#f3f4f6', fg: '#4b5563', accent: '#6b7280' },
}

export function buildDisplay<T extends PlanLike>(plan: T): PlanDisplay<T> {
  const { totalGB, isPerDay, isUnlimited } = parseDataCapacity(plan.dataCapacity)
  const days = Math.max(1, plan.displayDays)
  const total = isPerDay ? totalGB * days : totalGB
  const perDay = isPerDay ? totalGB : (totalGB / days)
  return {
    plan,
    totalGB: total,
    perDayGB: perDay,
    isPerDay,
    isUnlimited,
    perDayCost: Math.round(plan.sellPrice / days),
    tier: classifyTier(perDay, isUnlimited, plan.dataCapacity),
  }
}

/**
 * Annotate the list with `recommended: true` on whichever plan has the lowest
 * per-day cost. Returns a new array; never mutates the input.
 */
export interface AnnotatedDisplay<T extends PlanLike> extends PlanDisplay<T> {
  recommended: boolean
}

export function annotatePlans<T extends PlanLike>(plans: T[]): AnnotatedDisplay<T>[] {
  const displays = plans.map(buildDisplay)
  if (displays.length === 0) return []
  let bestIdx = 0
  for (let i = 1; i < displays.length; i++) {
    if (displays[i].perDayCost < displays[bestIdx].perDayCost) bestIdx = i
  }
  return displays.map((d, i) => ({ ...d, recommended: i === bestIdx && displays.length > 1 }))
}

/** Sort by per-day cost ascending (most cost-effective first). */
export function sortByValue<T extends PlanLike>(displays: AnnotatedDisplay<T>[]): AnnotatedDisplay<T>[] {
  return [...displays].sort((a, b) => a.perDayCost - b.perDayCost || a.plan.sellPrice - b.plan.sellPrice)
}
