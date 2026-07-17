import { describe, it, expect } from 'vitest'
import {
  mapTapPayFailureReason,
  isUserCancelStatus,
  TAPPAY_USER_CANCEL_STATUS,
} from '@/lib/services/tappay-failure-reason'

describe('mapTapPayFailureReason', () => {
  it('returns "您已取消付款" for LINE Pay user cancel (status 924)', () => {
    expect(mapTapPayFailureReason({ status: 924, msg: 'User cancelled' }))
      .toBe('您已取消付款')
  })

  it('returns dedicated message for known card decline codes', () => {
    expect(mapTapPayFailureReason({ status: 10003 })).toContain('餘額不足')
    expect(mapTapPayFailureReason({ status: 10013 })).toContain('安全碼錯誤')
    expect(mapTapPayFailureReason({ status: 30040 })).toContain('發卡銀行')
  })

  it('returns dedicated message for LINE Pay-specific codes', () => {
    expect(mapTapPayFailureReason({ status: 920 })).toContain('LINE Pay')
    expect(mapTapPayFailureReason({ status: 922 })).toContain('餘額不足')
  })

  it('falls back to code + msg for unknown statuses (regression-safe for new codes)', () => {
    const r = mapTapPayFailureReason({ status: 99999, msg: 'Something weird' })
    expect(r).toContain('99999')
    expect(r).toContain('Something weird')
  })

  it('truncates very long msg to avoid bloating the order row', () => {
    const long = 'x'.repeat(500)
    const r = mapTapPayFailureReason({ status: 88888, msg: long })
    // 80 字截斷 + 前面的固定字串
    expect(r.length).toBeLessThan(140)
  })

  it('handles null/undefined status gracefully', () => {
    expect(mapTapPayFailureReason({ status: null })).toBe('付款失敗，請重試')
    expect(mapTapPayFailureReason({ status: undefined })).toBe('付款失敗，請重試')
  })

  it('handles missing msg field for unknown codes', () => {
    const r = mapTapPayFailureReason({ status: 77777 })
    expect(r).toContain('77777')
    expect(r).not.toContain('：')  // no tail when msg absent
  })

  it('exposes user-cancel status as a constant for backend branching', () => {
    expect(TAPPAY_USER_CANCEL_STATUS).toBe(924)
    expect(isUserCancelStatus(924)).toBe(true)
    expect(isUserCancelStatus(0)).toBe(false)
    expect(isUserCancelStatus(null)).toBe(false)
  })
})
