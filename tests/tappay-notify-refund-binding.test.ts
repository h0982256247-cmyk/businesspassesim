import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// P0-2：TapPay notify 的「退款」與「付款失敗」兩條路徑，同樣不可直接相信 webhook body。
//
// 目標不變量：
//   TapPay webhook body 本身不能讓本地訂單進入 PAID / FAILED / REFUND side effect；
//   任何付款結果的狀態變更，都必須先用 TapPay authoritative transaction data
//   證明「這筆 transaction 確實屬於這張 local Order / Bundle」。
//
// 舊行為的兩個洞：
//   1. 逾時/取消訂單收到 status=0 → 直接拿 body 的 rec_trade_id 去退款。攻擊者可用
//      自己一張逾時訂單，配上「別人交易的 rec_trade_id」，把別人的款退掉（真實金流損失）。
//   2. status!==0 → 完全不驗真就 markOrderFailed / markBundleFailed。任何知道
//      order_number 的人都能把他人進行中的訂單打成 FAILED。
//   3. 退款一律走信用卡商店設定（tappay_credit），LINE Pay 訂單退款用錯 merchant。
//
// 與 P0-1 相同：不 mock '@/lib/services/tappay'（驗真就是被測對象），只換掉 fetch；
// 另外 mock tenant-config 讓兩個 gateway 有「不同的」商店設定，才能證明退款打對商店。
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    order: { findFirst: vi.fn(), aggregate: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    orderItem: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@/lib/services/tenant-config', () => ({
  getPaymentConfig: vi.fn(async (gateway: string) => ({
    tappay_credit: { partnerKey: 'pk_credit', merchantId: 'mid_credit', env: 'sandbox', isActive: true },
    tappay_linepay: { partnerKey: 'pk_linepay', merchantId: 'mid_linepay', env: 'sandbox', isActive: true },
  }[gateway] ?? null)),
}))
// mark* 現在回傳 P0-6 的 TransitionResult（{ ok, result, current }），route 會依它決策
vi.mock('@/lib/services/order', () => ({
  markOrderPaid: vi.fn(async () => ({ ok: true })), markBundlePaid: vi.fn(async () => ({ orders: [], changed: 0 })),
  markOrderFailed: vi.fn(async () => ({ ok: true })), markBundleFailed: vi.fn(async () => ({ count: 1 })),
  markOrderRefunded: vi.fn(async () => ({ ok: true })), markBundleRefunded: vi.fn(async () => ({ count: 1 })),
  markOrderCancelled: vi.fn(async () => ({ ok: true })),
  isOrderExpired: vi.fn(() => false),
}))
vi.mock('@/lib/services/esim', () => ({ triggerEsimActivation: vi.fn() }))
vi.mock('@/lib/services/notification', () => ({ notifyOrderPaid: vi.fn() }))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn() }))
vi.mock('@/lib/utils/fire-and-log', () => ({ fireAndLog: vi.fn() }))

import { POST } from '@/app/api/payment/tappay/notify/route'
import { prisma } from '@/lib/db/prisma'
import { triggerEsimActivation } from '@/lib/services/esim'
import {
  markOrderPaid, markOrderFailed, markBundleFailed, markOrderRefunded, markBundleRefunded,
  markOrderCancelled, isOrderExpired,
} from '@/lib/services/order'
import { recordAlert } from '@/lib/services/alert'

const makeReq = (body: unknown) => ({ json: async () => body }) as Parameters<typeof POST>[0]

const orderRow = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'oA', status: 'CANCELLED', bundleId: null, totalPaid: 399,
  createdAt: new Date(), userId: 'u1', orderItems: [],
  paymentMethod: 'CREDIT_CARD', tapPayOrderId: 'ESM-A',
  ...o,
})

const tradeRecord = (r: Partial<Record<string, unknown>> = {}) => ({
  rec_trade_id: 'TXN-A', order_number: 'ESM-A', amount: 399, record_status: 0,
  currency: 'TWD', merchant_id: 'mid_credit',
  ...r,
})

// TapPay 兩支 API 共用 fetch：用網址分流，並側錄每一次呼叫，
// 才能斷言「有沒有退款」「退款打去哪個商店」「驗真是否發生在退款之前」。
let calls: { url: string; body: Record<string, unknown> }[] = []
let queryRecords: unknown[] = []
let refundResponse: Record<string, unknown> = { status: 0 }

const refundCalls = () => calls.filter(c => c.url.includes('/transaction/refund'))
const queryCalls = () => calls.filter(c => c.url.includes('/transaction/query'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isOrderExpired).mockReturnValue(false)
  calls = []
  queryRecords = [tradeRecord()]
  refundResponse = { status: 0 }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    const u = String(url)
    calls.push({ url: u, body: JSON.parse(init.body) })
    if (u.includes('/transaction/query')) {
      return { json: async () => ({ status: 2, msg: 'End of list', trade_records: queryRecords }) }
    }
    if (u.includes('/transaction/refund')) return { json: async () => refundResponse }
    throw new Error(`unexpected fetch: ${u}`)
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('P0-2 逾時 / 取消訂單的晚到付款 — 退款前必須先綁定驗真', () => {
  // ★ 核心攻擊情境：攻擊者用自己一張已取消的訂單，配上別人交易的 rec_trade_id，
  //   把別人的款退掉（我方帳上真的少一筆錢）。
  it('rec_trade_id 屬於另一張訂單 → 不得退款、不得標 REFUNDED', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ id: 'oB', tapPayOrderId: 'ESM-B' }) as never,
    )
    queryRecords = [tradeRecord({ rec_trade_id: 'TXN-A', order_number: 'ESM-A' })]

    const res = await POST(makeReq({ order_number: 'ESM-B', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(refundCalls()).toHaveLength(0)
    expect(markOrderRefunded).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('查無此交易（偽造 rec_trade_id）→ 不得退款', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    queryRecords = []

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'FORGED' }))

    expect(res.status).toBe(400)
    expect(refundCalls()).toHaveLength(0)
    expect(markOrderRefunded).not.toHaveBeenCalled()
  })

  it('金額與訂單不符 → 不得退款（驗真失敗一律不打 refund）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    queryRecords = [tradeRecord({ amount: 1 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(refundCalls()).toHaveLength(0)
  })

  it('provider 顯示交易已退款（record_status=3）→ 不得再退一次', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    queryRecords = [tradeRecord({ record_status: 3 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(refundCalls()).toHaveLength(0)
  })

  it('合法晚到的信用卡付款 → 先驗真、再用信用卡商店設定退款', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    // 綁定驗真必須發生在退款之前
    expect(calls[0].url).toContain('/transaction/query')
    expect(refundCalls()).toHaveLength(1)
    const refund = refundCalls()[0]
    expect(refund.body.rec_trade_id).toBe('TXN-A')
    expect(refund.body.amount).toBe(399)
    expect(refund.body.partner_key).toBe('pk_credit')   // ← 信用卡商店
    expect(markOrderRefunded).toHaveBeenCalledWith('oA')
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('合法晚到的 LINE Pay 付款 → 必須用 LINE Pay 商店設定退款，不可用信用卡設定', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ paymentMethod: 'LINE_PAY' }) as never,
    )
    queryRecords = [tradeRecord({ merchant_id: 'mid_linepay', record_status: 1 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(queryCalls()[0].body.partner_key).toBe('pk_linepay')
    expect(refundCalls()).toHaveLength(1)
    expect(refundCalls()[0].body.partner_key).toBe('pk_linepay')   // ← 不可是 pk_credit
    expect(markOrderRefunded).toHaveBeenCalledWith('oA')
  })

  it('已退款訂單重送 notify → 早退，不得重複退款、也不得復活成 PAID', async () => {
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(orderRow() as never)                    // 第一次：CANCELLED
      .mockResolvedValue(orderRow({ status: 'REFUNDED' }) as never)  // 之後：已 REFUNDED
    // provider 端紀錄仍顯示已付款（TapPay 退款狀態未即時反映）——本地守門必須自己擋住
    const body = { order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }

    await POST(makeReq(body))
    const second = await POST(makeReq(body))

    expect((await second.json()).message).toBe('Already processed')
    expect(refundCalls()).toHaveLength(1)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('逾時（未取消）訂單收到晚到成功付款 → 一樣先驗真再退款', async () => {
    vi.mocked(isOrderExpired).mockReturnValue(true)
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING' }) as never,
    )

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(refundCalls()).toHaveLength(1)
    expect(markOrderRefunded).toHaveBeenCalledWith('oA')
  })

  it('Bundle 取消後晚到付款 → 以整組加總驗真並退整組金額', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ bundleId: 'BDL-1' }) as never,
    )
    vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: { totalPaid: 798 } } as never)
    queryRecords = [tradeRecord({ amount: 798 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(refundCalls()[0].body.amount).toBe(798)
    expect(markBundleRefunded).toHaveBeenCalledWith('BDL-1')
  })

  it('Bundle 取消後收到「只等於單張金額」的交易 → 不得退款', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ bundleId: 'BDL-1' }) as never,
    )
    vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: { totalPaid: 798 } } as never)
    queryRecords = [tradeRecord({ amount: 399 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(refundCalls()).toHaveLength(0)
    expect(markBundleRefunded).not.toHaveBeenCalled()
  })
})

describe('P0-2 付款失敗通知（status !== 0）— 未驗真不得改訂單狀態', () => {
  // ★ 攻擊情境：只要知道 order_number，就能把別人進行中的訂單打成 FAILED。
  it('偽造的失敗通知（rec_trade_id 屬於另一張訂單）→ 不得標 FAILED', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ id: 'oB', status: 'PROCESSING', tapPayOrderId: 'ESM-B' }) as never,
    )
    queryRecords = [tradeRecord({ rec_trade_id: 'TXN-A', order_number: 'ESM-A', record_status: -1 })]

    const res = await POST(makeReq({ order_number: 'ESM-B', status: 10003, rec_trade_id: 'TXN-A', msg: 'x' }))

    expect(res.status).toBe(400)
    expect(markOrderFailed).not.toHaveBeenCalled()
    expect(markBundleFailed).not.toHaveBeenCalled()
  })

  it('偽造的失敗通知（查無交易）→ 不得標 FAILED', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING' }) as never,
    )
    queryRecords = []

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 10003, rec_trade_id: 'FORGED' }))

    expect(res.status).toBe(400)
    expect(markOrderFailed).not.toHaveBeenCalled()
  })

  it('失敗通知完全不帶 rec_trade_id（無法驗真）→ 不得標 FAILED', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING' }) as never,
    )

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 10003 }))

    expect(res.status).toBe(400)
    expect(markOrderFailed).not.toHaveBeenCalled()
    expect(queryCalls()).toHaveLength(0)
  })

  it('webhook 說失敗、但 provider 顯示這筆其實已付款成功 → 不得標 FAILED', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING' }) as never,
    )
    queryRecords = [tradeRecord({ record_status: 0 })]   // 已授權成功

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 10003, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderFailed).not.toHaveBeenCalled()
  })

  it('真實的失敗交易（綁定成立、provider 也是失敗狀態）→ 照常標 FAILED 並寫入中文原因', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING' }) as never,
    )
    queryRecords = [tradeRecord({ record_status: -1 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 10003, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(markOrderFailed).toHaveBeenCalledWith('oA', '銀行端拒絕授權（餘額不足或卡片限額）')
  })

  it('LINE Pay 使用者取消（924，provider record_status=5 已取消）→ 標 FAILED 並顯示「您已取消付款」', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING', paymentMethod: 'LINE_PAY' }) as never,
    )
    queryRecords = [tradeRecord({ merchant_id: 'mid_linepay', record_status: 5 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 924, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(markOrderFailed).toHaveBeenCalledWith('oA', '您已取消付款')
  })

  it('Bundle 的真實失敗交易 → markBundleFailed（整組一致）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ status: 'PROCESSING', bundleId: 'BDL-1' }) as never,
    )
    queryRecords = [tradeRecord({ record_status: -1 })]

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 10003, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(markBundleFailed).toHaveBeenCalledWith('BDL-1', expect.any(String))
    expect(markOrderFailed).not.toHaveBeenCalled()
  })
})

// ─── 退款打款的冪等與失敗處理（F-3 / F-4）────────────────────────────
// 驗真本身含一次 Record API 往返（數百毫秒），TapPay 重送的兩則 notify 會同時通過驗真
// （provider 端此刻都還是「已付款」），若直接打款就是對同一筆交易退兩次。
// 另外：驗真通過但退款失敗＝錢在我們這邊、使用者沒有卡，絕不可靜默標成 CANCELLED。
describe('P0-2 退款打款 — 原子佔位與失敗處理', () => {
  beforeEach(() => {
    queryRecords = [tradeRecord()]
    vi.mocked(isOrderExpired).mockReturnValue(false)
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('打款前先以 tapPayRecTradeId 原子佔位（where 帶 null），搶到才呼叫 TapPay', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'oA', tapPayRecTradeId: null },
      data: { tapPayRecTradeId: 'TXN-A' },
    })
    expect(refundCalls()).toHaveLength(1)
  })

  it('佔位搶輸（另一則 notify 已在退款）→ 不重複打款、不改狀態', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 0 } as never)

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(refundCalls()).toHaveLength(0)
    expect(markOrderRefunded).not.toHaveBeenCalled()
    expect(markOrderCancelled).not.toHaveBeenCalled()
    expect(recordAlert).toHaveBeenCalledWith('refund_claim_conflict', expect.objectContaining({ orderId: 'oA' }))
  })

  it('驗真通過但 TapPay 退款失敗 → 記 error 告警、不標 CANCELLED、回 500 讓 TapPay 重送', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    refundResponse = { status: 1, msg: 'refund rejected' }

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(500)
    expect(recordAlert).toHaveBeenCalledWith('refund_failed', expect.objectContaining({
      orderId: 'oA', refundAmount: 399, level: 'error',
    }))
    // 款項沒退回，訂單狀態必須留著供對帳——不可被靜默標成 CANCELLED
    expect(markOrderCancelled).not.toHaveBeenCalled()
    expect(markOrderRefunded).not.toHaveBeenCalled()
  })
})
