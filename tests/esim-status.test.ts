import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { deriveEsimStatus, groupOf } from '@/lib/esimStatus'

// deriveEsimStatus 是列表＋詳情共用的「使用者視角狀態」單一來源，用固定時間測
// 到期邊界（daysLeftOf 用 Date.now()）。
const NOW = new Date('2026-06-13T00:00:00Z').getTime()
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

describe('deriveEsimStatus', () => {
  it('終態：FAILED / REFUNDED / CANCELLED', () => {
    expect(deriveEsimStatus({ status: 'FAILED' })).toMatchObject({ phase: 'failed', tone: 'error' })
    expect(deriveEsimStatus({ status: 'REFUNDED' }).phase).toBe('refunded')
    expect(deriveEsimStatus({ status: 'CANCELLED' }).phase).toBe('cancelled')
  })

  it('已激活且距到期 >3 天 → inUse，daysLeft 正確、tone active', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', activatedAt: 'x', activationEnd: iso(NOW + 10 * DAY) })
    expect(v).toMatchObject({ phase: 'inUse', tone: 'active', daysLeft: 10 })
  })

  it('已激活且 ≤3 天 → expiringSoon / warn', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', activatedAt: 'x', activationEnd: iso(NOW + 2 * DAY) })
    expect(v).toMatchObject({ phase: 'expiringSoon', tone: 'warn', daysLeft: 2 })
  })

  it('已激活但已過期 → ended', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', activatedAt: 'x', activationEnd: iso(NOW - 2 * DAY) })
    expect(v.phase).toBe('ended')
  })

  it('剛過期、未滿 24 小時 → 仍是 ended 且歸到 history', () => {
    // 迴歸測試：daysLeftOf 原本單用 Math.ceil，這段區間會算出 -0，而 -0 < 0 為
    // false，已斷網的卡會整整一天顯示「即將到期／今天到期」並釘在「使用中」。
    const v = deriveEsimStatus({ status: 'COMPLETED', activatedAt: 'x', activationEnd: iso(NOW - DAY / 12) })
    expect(v).toMatchObject({ phase: 'ended', tone: 'ended' })
    expect(groupOf(v.phase)).toBe('history')
    // 列表卡的倒數框以 daysLeft >= 0 為顯示條件，必須是負數才不會顯示「0 天」
    expect(v.daysLeft).toBeLessThan(0)
  })

  it('到期時刻正好等於現在 → ended', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', activatedAt: 'x', activationEnd: iso(NOW) })
    expect(v.phase).toBe('ended')
  })

  it('已激活、無到期日 → inUse，daysLeft null', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', activatedAt: 'x' })
    expect(v.phase).toBe('inUse')
    expect(v.daysLeft).toBeNull()
  })

  it('QR 已就緒、未激活 → installable，actionNeeded', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', esimRcode: 'r', esimQrcode: 'data:image/png;base64,xxx' })
    expect(v).toMatchObject({ phase: 'installable', actionNeeded: true })
  })

  it('已兌換、QR 未到 → generatingQr', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', esimRcode: 'r', redeemedAt: 'x' })
    expect(v.phase).toBe('generatingQr')
  })

  it('有 rcode、COMPLETED、未兌換 → readyToInstall，actionNeeded', () => {
    const v = deriveEsimStatus({ status: 'COMPLETED', esimRcode: 'r' })
    expect(v).toMatchObject({ phase: 'readyToInstall', actionNeeded: true })
  })

  it('PROCESSING → awaitingPayment；PAID（無 esim 欄位）→ preparing', () => {
    expect(deriveEsimStatus({ status: 'PROCESSING' }).phase).toBe('awaitingPayment')
    expect(deriveEsimStatus({ status: 'PAID' }).phase).toBe('preparing')
  })
})

describe('groupOf — 分頁分組', () => {
  it('inUse/expiringSoon → active', () => {
    expect(groupOf('inUse')).toBe('active')
    expect(groupOf('expiringSoon')).toBe('active')
  })
  it('readyToInstall/installable/generatingQr → install', () => {
    expect(groupOf('readyToInstall')).toBe('install')
    expect(groupOf('installable')).toBe('install')
    expect(groupOf('generatingQr')).toBe('install')
  })
  it('awaitingPayment/preparing → processing', () => {
    expect(groupOf('awaitingPayment')).toBe('processing')
    expect(groupOf('preparing')).toBe('processing')
  })
  it('ended/cancelled/failed/refunded → history', () => {
    for (const p of ['ended', 'cancelled', 'failed', 'refunded'] as const) {
      expect(groupOf(p)).toBe('history')
    }
  })
})
