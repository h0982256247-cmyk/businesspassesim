import { describe, it, expect } from 'vitest'
import { parseCapacityFromName, normalizeCapacity } from '@/lib/utils/capacity'

describe('parseCapacityFromName', () => {
  it('鈦金階層以關鍵字辨識（含「商務鈦金款」等不帶「吃到飽」的寫法）', () => {
    expect(parseCapacityFromName('日本 eSIM｜Softbank｜1天 商務鈦金款')).toBe('鈦金吃到飽')
    expect(parseCapacityFromName('日本 3天 鈦金吃到飽')).toBe('鈦金吃到飽')
    expect(parseCapacityFromName('鈦金款')).toBe('鈦金吃到飽')
  })

  it('高速 / 一般吃到飽', () => {
    expect(parseCapacityFromName('日本 1天 高速吃到飽')).toBe('高速吃到飽')
    expect(parseCapacityFromName('日本 1天 吃到飽')).toBe('無限吃到飽')
  })

  it('每日量（「每日」或「/天」後綴）', () => {
    expect(parseCapacityFromName('日本 eSIM｜1天 每日1GB')).toBe('1GB/天')
    expect(parseCapacityFromName('日本, 1天, 2GB/天')).toBe('2GB/天')
  })

  it('總量（無每日標記，前綴「總量」）；純天數不誤判為每日量', () => {
    expect(parseCapacityFromName('韓國 10天 總量5GB')).toBe('總量5GB')
    expect(parseCapacityFromName('韓國 10天 5GB')).toBe('總量5GB')
  })

  it('英文 token TI / HSD / MAX', () => {
    expect(parseCapacityFromName('JP-TI-5D')).toBe('鈦金吃到飽')
    expect(parseCapacityFromName('JP-HSD-5D')).toBe('高速吃到飽')
    expect(parseCapacityFromName('JP-10MAX-1D')).toBe('無限吃到飽')
  })

  it('無可辨識流量時回 null', () => {
    expect(parseCapacityFromName('日本 eSIM 方案')).toBeNull()
    expect(parseCapacityFromName('')).toBeNull()
  })
})

describe('normalizeCapacity', () => {
  it('正規化已知寫法、未知保留原字串、空值回 null', () => {
    expect(normalizeCapacity('商務鈦金款')).toBe('鈦金吃到飽')
    expect(normalizeCapacity('1GB/天')).toBe('1GB/天')
    expect(normalizeCapacity('')).toBeNull()
  })
})
