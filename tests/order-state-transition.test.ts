import { describe, it, expect, vi, beforeEach } from 'vitest'

// P0-6：Order 狀態機守門 — 較舊／並發的寫入不得覆蓋較新的終端狀態。
//
// 舊行為：markOrderPaid / markOrderFailed / markOrderCancelled / markOrderRefunded /
// markOrderCompleted 都是 blind `update({ where: { id } })`，呼叫端各自「先 SELECT
// 再判斷」。中間隔著供應商／金流 API 呼叫（數百毫秒～數秒），退款 worker、逾時 cron、
// 重送的 webhook 只要在這個窗口內先寫入，後手就會把終態蓋回去：退款後又變 COMPLETED、
// 已確認付款被亂序抵達的失敗通知打成 FAILED。
//
// 本測試用「行為與 PostgreSQL 條件式 UPDATE 一致」的假 prisma：updateMany 只在 where
// 仍成立時才寫入並回 count。並發以 Promise.all 或 controlled barrier（beforeWrite 閘門）
// 模擬——閘門讓「worker A 已決定要寫、退款在這中間落地」變成可重現的順序，而不是靠
// 巧合的排程。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/services/receipt', () => ({ ensureReceiptForOrder: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/product', () => ({ getProductById: vi.fn() }))
vi.mock('@/lib/services/group', () => ({ isApprovedMember: vi.fn() }))
// 憑證加密不是本輪重點：用 identity 讓斷言看得到原值
vi.mock('@/lib/utils/esim-crypto', () => ({
  encryptEsimFields: <T,>(x: T) => x,
  decryptEsimFields: <T,>(x: T) => x,
  redactEsimCredentials: <T,>(x: T) => x,
}))

import { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { ensureReceiptForOrder } from '@/lib/services/receipt'
import {
  markOrderProcessing, markOrderPaid, markBundlePaid,
  markOrderFailed, markBundleFailed, markOrderCancelled,
  markOrderRefunded, markBundleRefunded, markOrderCompleted,
  cancelExpiredPendingOrders,
} from '@/lib/services/order'
import { transitionOrderStatus, canTransition, allowedFromFor } from '@/lib/services/order-transition'

// ─── 假 prisma：語意比照 PostgreSQL 的條件式 UPDATE ─────────────────
type Row = Record<string, unknown>
let rows: Map<string, Row>
// controlled barrier：某個目標狀態要寫入前先卡住，讓另一條流程先落地
let beforeWrite: ((toStatus: unknown) => Promise<void>) | null = null

const OLD = new Date(Date.now() - 60 * 60 * 1000)   // 一小時前 → 逾時 cron 掃得到

const makeRow = (o: Row = {}): Row => ({
  id: 'oA', userId: 'u1', status: OrderStatus.PENDING, bundleId: null, bundleSeq: 1,
  totalPaid: 399, createdAt: OLD, paidAt: null,
  tapPayOrderId: null, tapPayRecTradeId: null, esimRcode: null,
  failureReason: null, cancelReason: null,
  orderItems: [{ productName: '日本 3天' }],
  ...o,
})

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v === null) { if (row[k] != null) return false; continue }
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const cond = v as Record<string, unknown>
      if ('in' in cond) { if (!(cond.in as unknown[]).includes(row[k])) return false; continue }
      if ('not' in cond) { if (row[k] === cond.not) return false; continue }
      if ('lt' in cond) { if (!((row[k] as Date) < (cond.lt as Date))) return false; continue }
    }
    if (row[k] !== v) return false
  }
  return true
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  beforeWrite = null
  rows = new Map([['oA', makeRow()]])

  vi.mocked(prisma.order.findUnique).mockImplementation((async ({ where }: { where: { id: string } }) =>
    rows.get(where.id) ?? null) as never)

  vi.mocked(prisma.order.findMany).mockImplementation((async ({ where }: { where: Record<string, unknown> }) =>
    [...rows.values()].filter(r => matches(r, where))) as never)

  vi.mocked(prisma.order.updateMany).mockImplementation((async ({ where, data }: {
    where: Record<string, unknown>; data: Record<string, unknown>
  }) => {
    // 閘門：模擬「這個 worker 已經決定要寫入，但實際寫入晚了一步」
    if (beforeWrite) await beforeWrite(data.status)
    const hits = [...rows.values()].filter(r => matches(r, where))
    for (const r of hits) Object.assign(r, data)
    return { count: hits.length }
  }) as never)
})

const statusOf = (id = 'oA') => rows.get(id)!.status

// ─── 轉移表本身 ────────────────────────────────────────────────────
describe('P0-6 Allowed Transitions — 明確禁止的轉移', () => {
  it('REFUNDED 不可回到 PAID / ESIM_PENDING / COMPLETED', () => {
    expect(canTransition(OrderStatus.REFUNDED, OrderStatus.PAID)).toBe(false)
    expect(canTransition(OrderStatus.REFUNDED, OrderStatus.ESIM_PENDING)).toBe(false)
    expect(canTransition(OrderStatus.REFUNDED, OrderStatus.COMPLETED)).toBe(false)
  })

  it('CANCELLED 不可回到 PAID / ESIM_PENDING / COMPLETED', () => {
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.PAID)).toBe(false)
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.ESIM_PENDING)).toBe(false)
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.COMPLETED)).toBe(false)
  })

  it('已付款／已完成不可被打回 FAILED / CANCELLED / PROCESSING', () => {
    for (const from of [OrderStatus.PAID, OrderStatus.COMPLETED]) {
      expect(canTransition(from, OrderStatus.FAILED)).toBe(false)
      expect(canTransition(from, OrderStatus.CANCELLED)).toBe(false)
      expect(canTransition(from, OrderStatus.PROCESSING)).toBe(false)
    }
  })

  // FAILED 在「付款以外」是終態；唯獨 FAILED → PAID 保留：notify 標 PAID 之前一定
  // 先過 Record API 回查驗真，provider 說扣款成功就是事實，不可讓錯誤的 FAILED
  // 把「已扣款卻拿不到卡」鎖死。現行 UI 的付款失敗只給「重新選購」（開新單），
  // 沒有原地重付，故不需要 FAILED → PROCESSING。
  it('FAILED 是終態，但保留「金流回查驗真後修正為 PAID」', () => {
    expect(canTransition(OrderStatus.FAILED, OrderStatus.COMPLETED)).toBe(false)
    expect(canTransition(OrderStatus.FAILED, OrderStatus.CANCELLED)).toBe(false)
    expect(canTransition(OrderStatus.FAILED, OrderStatus.PROCESSING)).toBe(false)
    expect(canTransition(OrderStatus.FAILED, OrderStatus.PAID)).toBe(true)
  })

  it('REFUNDED 位階最高：任何非 REFUNDED 狀態都進得去（退款只在供應商端成功後才呼叫）', () => {
    const from = allowedFromFor(OrderStatus.REFUNDED)
    for (const s of Object.values(OrderStatus)) {
      if (s === OrderStatus.REFUNDED) continue
      expect(from).toContain(s)
    }
  })
})

// ─── 終端狀態保護（單筆）─────────────────────────────────────────────
describe('P0-6 終端狀態保護 — 不可被較舊的寫入覆蓋', () => {
  it('should not complete refunded order（已退款不可被發卡 callback 復活）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.REFUNDED }))

    const r = await markOrderCompleted('oA', { esimRcode: 'R1' })

    expect(r.ok).toBe(false)
    expect(r.ok === false && r.result).toBe('invalid')
    expect(statusOf()).toBe(OrderStatus.REFUNDED)
    expect(rows.get('oA')!.esimRcode).toBeNull()   // 憑證也不可落地
  })

  it('should not complete cancelled order', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.CANCELLED }))

    const r = await markOrderCompleted('oA', { esimRcode: 'R1' })

    expect(r.ok).toBe(false)
    expect(statusOf()).toBe(OrderStatus.CANCELLED)
    expect(rows.get('oA')!.esimRcode).toBeNull()
  })

  it('should not mark refunded order paid（退款後不可被重送的付款通知復活）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.REFUNDED }))

    const r = await markOrderPaid('oA', 'TXN-1')

    expect(r.ok).toBe(false)
    expect(statusOf()).toBe(OrderStatus.REFUNDED)
    expect(rows.get('oA')!.tapPayRecTradeId).toBeNull()   // 附帶欄位也不可寫進去
    expect(ensureReceiptForOrder).not.toHaveBeenCalled()  // 不可補開收據
  })

  it('should not mark cancelled order paid', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.CANCELLED }))

    const r = await markOrderPaid('oA', 'TXN-1')

    expect(r.ok).toBe(false)
    expect(statusOf()).toBe(OrderStatus.CANCELLED)
    expect(ensureReceiptForOrder).not.toHaveBeenCalled()
  })

  it('should not overwrite terminal state from stale worker（拿舊快照的 worker 一律寫不進去）', async () => {
    // worker 讀到 PAID 之後才被退款；它手上的判斷已經過期
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))
    const snapshot = { ...rows.get('oA')! }
    expect(snapshot.status).toBe(OrderStatus.PAID)
    await markOrderRefunded('oA')

    const completed = await markOrderCompleted('oA', { esimRcode: 'R1' })
    const failed = await markOrderFailed('oA', '晚到的失敗通知')
    const cancelled = await markOrderCancelled('oA', '晚到的取消')

    expect([completed.ok, failed.ok, cancelled.ok]).toEqual([false, false, false])
    expect(statusOf()).toBe(OrderStatus.REFUNDED)
  })
})

// ─── Race A：退款 vs 發卡完成 ────────────────────────────────────────
describe('P0-6 Race A — 退款與發卡完成競態，結果必須是 REFUNDED', () => {
  it('should preserve refunded state when completion races with refund（controlled barrier）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))
    // worker A 已向供應商查到憑證、準備寫 COMPLETED；閘門讓後台退款先落地
    const gate = deferred()
    beforeWrite = async to => { if (to === OrderStatus.COMPLETED) await gate.promise }

    const completing = markOrderCompleted('oA', { esimRcode: 'R1' })
    beforeWrite = null
    await markOrderRefunded('oA')              // 後台退款先寫入
    gate.resolve()
    const completed = await completing         // worker A 這時才真的寫

    expect(completed.ok).toBe(false)
    expect(completed.ok === false && completed.result).toBe('invalid')
    expect(statusOf()).toBe(OrderStatus.REFUNDED)
    expect(rows.get('oA')!.esimRcode).toBeNull()
  })

  it('退款與完成同時發出（Promise.all）→ 無論順序，最終都是 REFUNDED', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))

    await Promise.all([markOrderCompleted('oA', { esimRcode: 'R1' }), markOrderRefunded('oA')])

    expect(statusOf()).toBe(OrderStatus.REFUNDED)
  })
})

// ─── Race B：逾時 cron 取消 vs 付款成功 ──────────────────────────────
describe('P0-6 Race B — 逾時取消與付款成功競態', () => {
  it('cron 取消先落地 → 已 CANCELLED 不可被 PAID overwrite（款項另循對帳）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PROCESSING, createdAt: OLD }))
    const gate = deferred()
    beforeWrite = async to => { if (to === OrderStatus.PAID) await gate.promise }

    const paying = markOrderPaid('oA', 'TXN-1')
    beforeWrite = null
    const cancelled = await cancelExpiredPendingOrders()   // cron 在扣款回應之前掃到
    gate.resolve()
    const paid = await paying

    expect(cancelled).toBe(1)
    expect(paid.ok).toBe(false)
    expect(statusOf()).toBe(OrderStatus.CANCELLED)
    expect(rows.get('oA')!.tapPayRecTradeId).toBeNull()
  })

  it('付款先落地 → 逾時 cron 不得把真實付款成功的訂單取消掉', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PROCESSING, createdAt: OLD }))

    const paid = await markOrderPaid('oA', 'TXN-1')
    const cancelled = await cancelExpiredPendingOrders()

    expect(paid.ok).toBe(true)
    expect(cancelled).toBe(0)
    expect(statusOf()).toBe(OrderStatus.PAID)
  })

  it('逾時 cron 掃描條件只涵蓋 PENDING / PROCESSING，不碰已付款與終態', async () => {
    rows = new Map([
      ['p1', makeRow({ id: 'p1', status: OrderStatus.PENDING })],
      ['p2', makeRow({ id: 'p2', status: OrderStatus.PROCESSING })],
      ['p3', makeRow({ id: 'p3', status: OrderStatus.PAID })],
      ['p4', makeRow({ id: 'p4', status: OrderStatus.COMPLETED })],
      ['p5', makeRow({ id: 'p5', status: OrderStatus.REFUNDED })],
      ['p6', makeRow({ id: 'p6', status: OrderStatus.FAILED })],
    ])

    expect(await cancelExpiredPendingOrders()).toBe(2)
    expect(statusOf('p3')).toBe(OrderStatus.PAID)
    expect(statusOf('p4')).toBe(OrderStatus.COMPLETED)
    expect(statusOf('p5')).toBe(OrderStatus.REFUNDED)
    expect(statusOf('p6')).toBe(OrderStatus.FAILED)
  })
})

// ─── Race C：失敗與成功通知亂序 ─────────────────────────────────────
describe('P0-6 Race C — 失敗／成功通知亂序抵達', () => {
  it('should preserve paid state against stale failure callback', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID, tapPayRecTradeId: 'TXN-1' }))

    const r = await markOrderFailed('oA', '銀行端拒絕授權')

    expect(r.ok).toBe(false)
    expect(r.ok === false && r.result).toBe('invalid')
    expect(statusOf()).toBe(OrderStatus.PAID)
    expect(rows.get('oA')!.failureReason).toBeNull()   // 失敗原因也不可寫上去
  })

  it('已 COMPLETED（卡已交付）更不可被失敗通知打回 FAILED', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.COMPLETED }))

    expect((await markOrderFailed('oA', 'x')).ok).toBe(false)
    expect(statusOf()).toBe(OrderStatus.COMPLETED)
  })

  // 反向：先 FAILED 後成功。notify 標 PAID 前一定先過 Record API 回查驗真，
  // provider 說扣款成功就是事實 → 允許修正，否則「已扣款卻永遠拿不到卡」無法自動恢復。
  it('先 FAILED 後收到「已驗真」的成功結果 → 允許修正為 PAID', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.FAILED, failureReason: '授權失敗' }))

    const r = await markOrderPaid('oA', 'TXN-1')

    expect(r.ok).toBe(true)
    expect(statusOf()).toBe(OrderStatus.PAID)
  })

  it('付款成功與失敗通知同時抵達 → 不會停在 FAILED 而讓已扣款訂單卡死', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PROCESSING }))

    await Promise.all([markOrderPaid('oA', 'TXN-1'), markOrderFailed('oA', '亂序失敗通知')])

    expect(statusOf()).toBe(OrderStatus.PAID)
  })
})

// ─── Race D：重複完成 / 重複 PAID ───────────────────────────────────
describe('P0-6 Race D — 重複通知必須冪等，不可當成嚴重錯誤', () => {
  it('should safely handle duplicate completion（第二次回 already，不重寫憑證）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))

    const first = await markOrderCompleted('oA', { esimRcode: 'R1' })
    const second = await markOrderCompleted('oA', { esimRcode: 'R1' })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(second.ok === false && second.result).toBe('already')
    expect(statusOf()).toBe(OrderStatus.COMPLETED)
    expect(rows.get('oA')!.esimRcode).toBe('R1')
  })

  it('同一則完成 callback 並發重送（Promise.all）→ 只有一則寫得進去', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))

    const results = await Promise.all(
      Array.from({ length: 5 }, () => markOrderCompleted('oA', { esimRcode: 'R1' })),
    )

    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok && r.result === 'already')).toHaveLength(4)
    expect(statusOf()).toBe(OrderStatus.COMPLETED)
  })

  it('should safely handle duplicate paid transition（收據只開一張）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PROCESSING }))

    const results = await Promise.all([
      markOrderPaid('oA', 'TXN-1'), markOrderPaid('oA', 'TXN-1'), markOrderPaid('oA', 'TXN-1'),
    ])

    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok && r.result === 'already')).toHaveLength(2)
    expect(ensureReceiptForOrder).toHaveBeenCalledTimes(1)
    expect(statusOf()).toBe(OrderStatus.PAID)
  })

  it('重複退款通知 → already，不是錯誤', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))

    await markOrderRefunded('oA')
    const again = await markOrderRefunded('oA')

    expect(again.ok).toBe(false)
    expect(again.ok === false && again.result).toBe('already')
    expect(statusOf()).toBe(OrderStatus.REFUNDED)
  })

  it('兩個並發付款請求搶 PENDING→PROCESSING 鎖 → 只有一個拿到', async () => {
    const locks = await Promise.all([
      markOrderProcessing('oA', 'ESM-1'), markOrderProcessing('oA', 'ESM-1'),
    ])

    expect(locks.filter(Boolean)).toHaveLength(1)
    expect(statusOf()).toBe(OrderStatus.PROCESSING)
  })
})

// ─── 失敗語意：不可一律當 500 ───────────────────────────────────────
describe('P0-6 轉移失敗的語意分辨（already / invalid / conflict / not_found）', () => {
  it('should return state conflict / no-op for invalid transition（不丟例外、不當系統故障）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.REFUNDED }))

    const r = await transitionOrderStatus('oA', OrderStatus.COMPLETED)

    expect(r).toEqual({ ok: false, result: 'invalid', to: OrderStatus.COMPLETED, current: OrderStatus.REFUNDED })
  })

  it('已在目標狀態 → already（冪等，與 invalid 分得開）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.COMPLETED }))

    const r = await transitionOrderStatus('oA', OrderStatus.COMPLETED)

    expect(r.ok === false && r.result).toBe('already')
  })

  it('CAS 落空但目前狀態其實合法 → conflict（純併發，可由呼叫端重試）', async () => {
    rows.set('oA', makeRow({ status: OrderStatus.PAID }))
    // 模擬：CAS 當下不是 PAID，回讀時又變回 PAID（另一個 worker 來回改動）
    vi.mocked(prisma.order.updateMany).mockResolvedValueOnce({ count: 0 } as never)

    const r = await transitionOrderStatus('oA', OrderStatus.COMPLETED)

    expect(r.ok === false && r.result).toBe('conflict')
  })

  it('訂單不存在 → not_found，不是 invalid', async () => {
    const r = await transitionOrderStatus('nope', OrderStatus.PAID)

    expect(r.ok === false && r.result).toBe('not_found')
    expect(r.ok === false && r.current).toBeNull()
  })
})

// ─── Bundle：一筆付款 → 多個 Order ──────────────────────────────────
describe('P0-6 Bundle — 不可因 blind update 覆蓋終端 sibling', () => {
  const bundle = () => {
    rows = new Map([
      ['b1', makeRow({ id: 'b1', bundleId: 'BDL-1', bundleSeq: 1, status: OrderStatus.PENDING })],
      ['b2', makeRow({ id: 'b2', bundleId: 'BDL-1', bundleSeq: 2, status: OrderStatus.PENDING })],
      ['b3', makeRow({ id: 'b3', bundleId: 'BDL-1', bundleSeq: 3, status: OrderStatus.PENDING })],
    ])
  }

  it('sibling 已單張退款 → markBundlePaid 不得把它蓋回 PAID，也不得帶進發卡清單', async () => {
    bundle()
    rows.get('b2')!.status = OrderStatus.REFUNDED

    const paid = await markBundlePaid('BDL-1', 'TXN-1')

    expect(statusOf('b2')).toBe(OrderStatus.REFUNDED)
    expect(paid.orders.map(o => o.id)).toEqual(['b1', 'b3'])
    expect(paid.changed).toBe(2)
  })

  it('整組已被逾時取消 → markBundlePaid 回空陣列（呼叫端據此走對帳，不發卡）', async () => {
    bundle()
    for (const r of rows.values()) r.status = OrderStatus.CANCELLED

    const paid = await markBundlePaid('BDL-1', 'TXN-1')

    expect(paid.orders).toEqual([])
    expect(paid.changed).toBe(0)
    expect([...rows.values()].every(r => r.status === OrderStatus.CANCELLED)).toBe(true)
  })

  it('markBundleFailed 不得把已 PAID / COMPLETED 的 sibling 打成 FAILED', async () => {
    bundle()
    rows.get('b1')!.status = OrderStatus.PAID
    rows.get('b2')!.status = OrderStatus.COMPLETED

    await markBundleFailed('BDL-1', '付款失敗')

    expect(statusOf('b1')).toBe(OrderStatus.PAID)
    expect(statusOf('b2')).toBe(OrderStatus.COMPLETED)
    expect(statusOf('b3')).toBe(OrderStatus.FAILED)
  })

  it('markBundleRefunded 涵蓋整組，已 REFUNDED 的不重複改寫', async () => {
    bundle()
    rows.get('b1')!.status = OrderStatus.PAID
    rows.get('b2')!.status = OrderStatus.REFUNDED
    rows.get('b3')!.status = OrderStatus.COMPLETED

    const r = await markBundleRefunded('BDL-1')

    expect(r.count).toBe(2)
    expect([...rows.values()].every(x => x.status === OrderStatus.REFUNDED)).toBe(true)
  })

  it('整組付款寫入前逾時 cron 先取消 → 不得把 CANCELLED sibling 蓋回 PAID（controlled barrier）', async () => {
    bundle()
    const gate = deferred()
    beforeWrite = async to => { if (to === OrderStatus.PAID) await gate.promise }

    const paying = markBundlePaid('BDL-1', 'TXN-1')
    beforeWrite = null
    expect(await cancelExpiredPendingOrders()).toBe(3)   // cron 在付款寫入之前掃到整組
    gate.resolve()
    const paid = await paying

    expect(paid.orders).toEqual([])
    expect(paid.changed).toBe(0)
    expect([...rows.values()].every(r => r.status === OrderStatus.CANCELLED)).toBe(true)
  })
})
