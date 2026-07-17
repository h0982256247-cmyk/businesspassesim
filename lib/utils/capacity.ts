// Parse data capacity from CSV product names, plan codes, or SKU strings.
// Shared by CSV import and the admin "recompute meta" tool so they classify
// rows consistently. Returns a display string (e.g. "吃到飽" / "1GB/天" /
// "500MB") or null when nothing recognisable is found.

// 「token 前後是否為國家／詞邊界」 - 寬鬆版：允許前面是數字（10MAX-1D 也算）
// 但仍然排除前後是英文字母的情況（避免 MAXIMUM 被當吃到飽）。
const TI_RE  = /(?<![A-Za-z])TI(?![A-Za-z])/i
const HSD_RE = /(?<![A-Za-z])HSD(?![A-Za-z])/i
const MAX_RE = /(?<![A-Za-z])MAX(?![A-Za-z])/i

// 數字流量：500MB / 1GB / 1GB/天 / 1.5GB/day
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(MB|GB|TB)(\s*\/\s*(?:天|日|day))?/i

// 「每日」標記可能出現在數字前後，或以後綴 /天 /日 /day 呈現。
// 例：「每日500MB」「500MB每天」「500MB / 天」「1GB/day」「daily 1GB」。
// 注意：必須帶「每」或「/」，純「5天」「3日」是天數而非每日量，不可誤判。
const PER_DAY_RE = /每\s*[天日]|\/\s*(?:天|日|day)|per[\s-]*day|daily/i

export function parseCapacityFromName(name: string): string | null {
  if (!name) return null

  // 中文吃到飽 token，先檢查最具體的（鈦金 / 高速）再 fallback 到一般吃到飽
  if (/鈦金吃到飽/.test(name))                              return '鈦金吃到飽'
  if (/高速吃到飽/.test(name))                              return '高速吃到飽'
  if (/(無限量|不限流量|無限流量|吃到飽)/.test(name))       return '無限吃到飽'

  // 英文 token：TI / HSD / MAX
  if (TI_RE.test(name))  return '鈦金吃到飽'
  if (HSD_RE.test(name)) return '高速吃到飽'
  if (MAX_RE.test(name)) return '無限吃到飽'

  const m = name.match(SIZE_RE)
  if (!m) return null
  const size = `${m[1]}${m[2].toUpperCase()}`
  // 後綴直接命中，或整串名稱含「每日」類標記，都視為每日量。
  // 每日量保留「/天」後綴；總量（無每日標記）前面補「總量」讓前台一眼可辨。
  const isPerDay = Boolean(m[3]) || PER_DAY_RE.test(name)
  return isPerDay ? `${size}/天` : `總量${size}`
}

// 把任意流量字串正規化成前台統一顯示格式：
//   每日 → "1GB/天"；總量 → "總量1GB"；吃到飽 → 鈦金/無限/高速吃到飽。
// 無法辨識時保留原字串（去頭尾空白）。匯入與重算共用，確保全站一致。
export function normalizeCapacity(raw: string | null | undefined): string | null {
  if (!raw) return null
  return parseCapacityFromName(raw) ?? (raw.trim() || null)
}
