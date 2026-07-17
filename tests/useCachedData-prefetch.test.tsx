import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  useCachedData,
  invalidateCache,
  prefetchCache,
  peekCache,
  setCache,
  productsCacheKey,
} from '@/hooks/useCachedData'

const KEY = 'test:products'

describe('prefetchCache + useCachedData warmup', () => {
  beforeEach(() => { invalidateCache(KEY) })

  it('populates cache so a later useCachedData consumer renders without loading state', async () => {
    const loader = vi.fn().mockResolvedValue({ products: [1, 2, 3] })
    prefetchCache(KEY, loader)
    // 等 prefetch 寫進 cache
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    const consumerLoader = vi.fn().mockResolvedValue({ products: [1, 2, 3] })
    const { result } = renderHook(() => useCachedData(KEY, consumerLoader))

    // 首次 render 就有資料，不是 loading 狀態
    expect(result.current.data).toEqual({ products: [1, 2, 3] })
    expect(result.current.loading).toBe(false)
  })

  it('skips loader when cache already has the key (no duplicate network)', async () => {
    const loader1 = vi.fn().mockResolvedValue({ x: 1 })
    prefetchCache(KEY, loader1)
    await waitFor(() => expect(loader1).toHaveBeenCalledTimes(1))

    const loader2 = vi.fn().mockResolvedValue({ x: 2 })
    prefetchCache(KEY, loader2)
    // 第二次呼叫不該再跑 loader
    expect(loader2).not.toHaveBeenCalled()
  })

  it('peekCache returns undefined when nothing is cached, and the stored value once set', () => {
    expect(peekCache(KEY)).toBeUndefined()
    setCache(KEY, { foo: 'bar' })
    expect(peekCache<{ foo: string }>(KEY)).toEqual({ foo: 'bar' })
  })

  it('setCache overwrites an existing entry (unlike prefetchCache which would skip)', async () => {
    setCache(KEY, { v: 1 })
    setCache(KEY, { v: 2 })
    expect(peekCache<{ v: number }>(KEY)).toEqual({ v: 2 })
  })

  it('productsCacheKey produces stable keys home + products both should reference', () => {
    expect(productsCacheKey()).toBe('products:')
    expect(productsCacheKey(null)).toBe('products:')
    expect(productsCacheKey('JP')).toBe('products:JP')
  })

  it('swallows loader rejection — does not throw, leaves cache empty for real consumer to retry', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('boom'))
    expect(() => prefetchCache(KEY, loader)).not.toThrow()
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

    // cache 應該還是空的，所以下游 useCachedData 還會自己抓
    const consumerLoader = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useCachedData(KEY, consumerLoader))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }))
  })
})
