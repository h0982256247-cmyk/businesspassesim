'use client'

import { usePathname } from 'next/navigation'

// 回傳目前的 LIFF base path
// - /liff/[slug]/... → "/liff/slug"
// - 舊版 (liff) route → ""
export function useLiffBase(): string {
  const pathname = usePathname()
  const m = pathname.match(/^(\/liff\/[^/]+)/)
  return m ? m[1] : ''
}
