import { describe, it, expect } from 'vitest'
import { pickInitialDay, PRODUCTS_DEFAULT_DAYS } from '@/lib/utils/products-day-default'

describe('pickInitialDay', () => {
  it('returns null when no days available', () => {
    expect(pickInitialDay([])).toBeNull()
  })

  it('picks 5 when 5 is in availableDays', () => {
    expect(pickInitialDay([1, 3, 5, 7, 14, 30])).toBe(5)
    expect(pickInitialDay([5])).toBe(5)
  })

  it('falls back to nearest when 5 is not available', () => {
    expect(pickInitialDay([3, 7, 14])).toBe(3)    // |3-5|=2, |7-5|=2 → tie, sort() stable picks first
    expect(pickInitialDay([7, 14, 30])).toBe(7)   // |7-5|=2 closest
    expect(pickInitialDay([1, 3])).toBe(3)        // |3-5|=2 closest
    expect(pickInitialDay([10, 30])).toBe(10)     // |10-5|=5 closest
  })

  it('handles unsorted input', () => {
    expect(pickInitialDay([30, 7, 5, 1])).toBe(5)
    expect(pickInitialDay([30, 14, 3])).toBe(3)
  })

  it('handles single-element arrays without 5', () => {
    expect(pickInitialDay([1])).toBe(1)
    expect(pickInitialDay([30])).toBe(30)
  })

  it('exports the constant for callers that want to know the target', () => {
    expect(PRODUCTS_DEFAULT_DAYS).toBe(5)
  })
})
