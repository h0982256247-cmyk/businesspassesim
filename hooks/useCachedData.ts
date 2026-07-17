'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 輕量 stale-while-revalidate 快取：
// - 切回看過的頁面時立即顯示舊資料（不再整頁轉圈），同時在背景重新抓取更新。
// - module 層級的 Map 在單頁應用（client 端導航）中跨頁面保留。
// 之後若改成 Server Component 直出（D 階段），只要把伺服器資料用 initialData
// 帶進來當初始快取即可銜接，hook 介面不需重寫。

type Entry = { data: unknown; ts: number }
const cache = new Map<string, Entry>()

// 主動清掉某個 key 的快取（例如資料被使用者改動、需強制重抓）。
export function invalidateCache(key: string) {
  cache.delete(key)
}

// 同步讀取某 key 的快取（不會觸發任何抓取）。給尚未轉成 useCachedData
// 但仍想在跨頁時避免重打 API 的 component 用：自己的 useEffect 內先
// peek，有 hit 直接 setState 並 skip fetch。
export function peekCache<T>(key: string): T | undefined {
  return cache.get(key)?.data as T | undefined
}

// 同步把資料寫進快取（覆蓋既有 entry）。給拿到新版資料、想讓其他頁面
// 立刻吃到的場景用。prefetchCache 會 skip 已有 entry，不適合用來「更新」。
export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() })
}

// 在使用者尚未進入需要該資料的頁面前，背景把 loader 跑一次寫進快取。
// 用途：主頁掛載時預熱 /api/products，使用者按下「商城」時 useCachedData
// 立刻有 cached entry 可顯示，不必等網路往返。重複呼叫（已有 cache）會 skip。
// 失敗靜默忽略，下一次真正的 useCachedData 會自己重抓。
export function prefetchCache<T>(key: string, loader: () => Promise<T>): void {
  if (cache.has(key)) return
  loader()
    .then(result => { cache.set(key, { data: result, ts: Date.now() }) })
    .catch(() => { /* swallow — the real consumer will retry */ })
}

// 共用 cache key。主頁預熱與 products 頁取讀都引用同一個常數，避免 key 漂移。
export const PRODUCTS_CACHE_KEY_PREFIX = 'products:'
export function productsCacheKey(countryCode?: string | null): string {
  return `${PRODUCTS_CACHE_KEY_PREFIX}${countryCode ?? ''}`
}

export interface CachedDataResult<T> {
  data: T | undefined
  loading: boolean       // 首次載入、且無快取可顯示時為 true（此時顯示骨架）
  revalidating: boolean  // 有快取顯示中、背景刷新中
  refresh: () => Promise<void>
}

export function useCachedData<T>(
  key: string | null,
  loader: () => Promise<T>,
  initialData?: T,
): CachedDataResult<T> {
  // render 期間就把伺服器初始值塞進快取，讓首屏直接有資料（D 階段銜接用）。
  if (key != null && initialData !== undefined && !cache.has(key)) {
    cache.set(key, { data: initialData, ts: Date.now() })
  }

  const cached = key != null ? cache.get(key) : undefined
  const [data, setData] = useState<T | undefined>(cached?.data as T | undefined)
  const [loading, setLoading] = useState(cached == null)
  const [revalidating, setRevalidating] = useState(false)

  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    if (key == null) return
    let active = true

    const entry = cache.get(key)
    if (entry) {
      setData(entry.data as T)
      setLoading(false)
      setRevalidating(true)
    } else {
      setLoading(true)
    }

    loaderRef.current()
      .then(result => {
        cache.set(key, { data: result, ts: Date.now() })
        if (active) setData(result)
      })
      .catch(() => {
        // 保留既有快取；首次載入失敗則維持 undefined，由頁面自行處理空狀態
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          setRevalidating(false)
        }
      })

    return () => { active = false }
  }, [key])

  const refresh = useCallback(async () => {
    const k = keyRef.current
    if (k == null) return
    setRevalidating(true)
    try {
      const result = await loaderRef.current()
      cache.set(k, { data: result, ts: Date.now() })
      setData(result)
    } catch {
      // 忽略刷新錯誤，沿用舊資料
    } finally {
      setRevalidating(false)
    }
  }, [])

  return { data, loading, revalidating, refresh }
}
