/**
 * <CountryFlag /> — 統一的國旗 SVG 顯示元件
 *
 * 來源策略：
 *   1) 2 碼 ISO（含 EU）→ https://flagcdn.com/{code}.svg（高解析向量）
 *   2) 自訂多國代碼（ANZ/SEA/HKM/CNT/MEA/WW/AFR/SAM）→ 本地 /flags/globe.svg
 *   3) 找不到 code → 顯示 fallbackEmoji（若有）或地球 SVG
 *
 * 視覺：1px 邊線 + 圓角 + 微陰影 → 質感
 */

const MULTI_REGION_CODES = new Set(['ANZ', 'SEA', 'HKM', 'CNT', 'MEA', 'WW', 'AFR', 'SAM'])

function resolveSrc(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.trim().toUpperCase()
  if (!upper) return null
  if (MULTI_REGION_CODES.has(upper)) return '/flags/globe.svg'
  // EU 與其他 2 碼 ISO 由 flagcdn.com 處理
  if (/^[A-Z]{2}$/.test(upper)) return `https://flagcdn.com/${upper.toLowerCase()}.svg`
  return null
}

export interface CountryFlagProps {
  code?: string | null
  /** 顯示寬度（px）；預設 32。高度自動 = width × 0.75（4:3 標準比例） */
  size?: number
  /** 找不到 SVG 時的 emoji fallback（舊資料相容） */
  fallbackEmoji?: string | null
  /** 圓角，預設 true */
  rounded?: boolean
  /** 陰影，預設 true */
  shadow?: boolean
  className?: string
  style?: React.CSSProperties
}

export function CountryFlag({
  code,
  size = 32,
  fallbackEmoji,
  rounded = true,
  shadow = true,
  className,
  style,
}: CountryFlagProps) {
  const src = resolveSrc(code)
  const width = size
  const height = Math.round(size * 0.75)
  const radius = rounded ? Math.max(2, Math.round(size * 0.12)) : 0

  // 沒 code 但有 emoji → 顯示 emoji（過渡期相容）
  if (!src) {
    if (fallbackEmoji) {
      return (
        <span
          className={className}
          style={{
            display: 'inline-block',
            fontSize: Math.round(size * 0.95),
            lineHeight: 1,
            verticalAlign: 'middle',
            ...style,
          }}
        >
          {fallbackEmoji}
        </span>
      )
    }
    // 都沒有 → 用地球 SVG 作為最後 fallback
    return renderFrame('/flags/globe.svg', width, height, radius, shadow, className, style, '')
  }

  return renderFrame(src, width, height, radius, shadow, className, style, (code || '').toUpperCase())
}

function renderFrame(
  src: string,
  width: number,
  height: number,
  radius: number,
  shadow: boolean,
  className?: string,
  style?: React.CSSProperties,
  alt = '',
) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        boxShadow: shadow
          ? '0 1px 2px rgba(15, 23, 42, 0.12), inset 0 0 0 1px rgba(15, 23, 42, 0.08)'
          : 'inset 0 0 0 1px rgba(15, 23, 42, 0.08)',
        backgroundColor: '#f1f5f9',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    >
      {/* 用原生 img 而非 next/image：免設 remotePatterns，SVG 不需優化 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </span>
  )
}
