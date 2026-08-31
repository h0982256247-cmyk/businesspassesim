import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// P0-1：TapPay 交易必須與本地訂單「完整綁定」才能承認付款。
//
// /api/payment/tappay/notify 是無簽章的公開 endpoint（proxy.ts 的 PUBLIC_API），
// body 完全由呼叫端決定。舊驗真只確認「rec_trade_id 查得到 + 金額相符 + record_status
// 是成功」，沒有比對 Record API 回來的 order_number 與 merchant，因此攻擊者可以拿
// 「別張訂單的合法 rec_trade_id」+「自己那張未付款、金額剛好相同的 order_number」
// 打進來，把未付款訂單洗成 PAID 並觸發真實 eSIM 成本。
//
// 這支測試不 mock '@/lib/services/tappay'——驗真邏輯（Record API 解析 + 綁定比對）
// 就是要被測的東西，只把最外層 fetch 換掉，模擬 TapPay Record API 的真實回應。
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    order: { findFirst: vi.fn(), aggregate: vi.fn() },
    orderItem: { findMany: vi.fn(async () => []) },
    // getConfig 先讀全域 PaymentConfig 再退回 env：回 null 讓它走 env config
    paymentConfig: { findUnique: async () => null },
  },
}))
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
vi.mock('@/lib/services/tappay-failure-reason', () => ({ mapTapPayFailureReason: vi.fn(() => 'x') }))

import { POST } from '@/app/api/payment/tappay/notify/route'
import { prisma } from '@/lib/db/prisma'
import { triggerEsimActivation } from '@/lib/services/esim'
import { markOrderPaid, markBundlePaid } from '@/lib/services/order'

const makeReq = (body: unknown) => ({ json: async () => body }) as Parameters<typeof POST>[0]

// 本地訂單（server-side authoritative）
const orderRow = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'oA', status: 'PROCESSING', bundleId: null, totalPaid: 399,
  createdAt: new Date(), userId: 'u1', orderItems: [],
  paymentMethod: 'CREDIT_CARD', tapPayOrderId: 'ESM-A',
  ...o,
})

// TapPay Record API 交易紀錄（provider authoritative）
const tradeRecord = (r: Partial<Record<string, unknown>> = {}) => ({
  rec_trade_id: 'TXN-A', order_number: 'ESM-A', amount: 399, record_status: 0,
  currency: 'TWD', merchant_id: 'mid_credit',
  ...r,
})

// Record API 查到資料時 status 常回 2（"End of list"），不是 0 —— 見 tappay.ts 註解
const stubRecordApi = (records: unknown[]) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => ({ status: 2, msg: 'End of list', trade_records: records }),
  }))

describe('P0-1 TapPay notify — 交易必須綁定本地訂單', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TAPPAY_PARTNER_KEY', 'pk_test')
    vi.stubEnv('TAPPAY_MERCHANT_ID', 'mid_credit')
    vi.stubEnv('TAPPAY_LINEPAY_MERCHANT_ID', 'mid_linepay')
    vi.stubEnv('TAPPAY_ENV', 'sandbox')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('合法交易 + 正確訂單 → 標記 PAID 並發卡', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    stubRecordApi([tradeRecord()])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(markOrderPaid).toHaveBeenCalledWith('oA', 'TXN-A', undefined)
    expect(triggerEsimActivation).toHaveBeenCalledWith('oA')
  })

  // ★ 核心攻擊情境：Transaction A 真的付了 399 元、屬於 Order A；
  //   Order B 也剛好 399 元且未付款。攻擊者拿 A 的 rec_trade_id 去付 B。
  it('同金額但 rec_trade_id 屬於另一張訂單 → 拒絕，不得 PAID、不得發卡', async () => {
    // 收到的是 Order B（未付款、金額同樣 399）
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ id: 'oB', tapPayOrderId: 'ESM-B' }) as never,
    )
    // 但 Record API 回來的權威資料顯示：這筆交易的 order_number 是 ESM-A
    stubRecordApi([tradeRecord({ rec_trade_id: 'TXN-A', order_number: 'ESM-A' })])

    const res = await POST(makeReq({ order_number: 'ESM-B', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(markBundlePaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('Record API 回傳的 rec_trade_id 與查詢的不同（filter 被忽略）→ 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    stubRecordApi([tradeRecord({ rec_trade_id: 'TXN-OTHER' })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('金額不符 → 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    stubRecordApi([tradeRecord({ amount: 1 })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('幣別不符 → 拒絕（金額比對必須同幣別才有意義）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    stubRecordApi([tradeRecord({ currency: 'USD' })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
  })

  it('gateway / merchant 不符（訂單是 LINE Pay，交易屬於信用卡商店）→ 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ paymentMethod: 'LINE_PAY' }) as never,
    )
    stubRecordApi([tradeRecord({ merchant_id: 'mid_credit' })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('LINE Pay 訂單 + LINE Pay 商店交易 → 放行（守門不誤擋正常流程）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ paymentMethod: 'LINE_PAY' }) as never,
    )
    // LINE Pay 即時請款 → record_status 1；無 card_info
    stubRecordApi([tradeRecord({ merchant_id: 'mid_linepay', record_status: 1 })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(markOrderPaid).toHaveBeenCalledWith('oA', 'TXN-A', undefined)
  })

  it('provider 交易狀態不是有效付款狀態（已退款 record_status=3）→ 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    stubRecordApi([tradeRecord({ record_status: 3 })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('查無此交易（偽造 rec_trade_id）→ 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    stubRecordApi([])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'FORGED' }))

    expect(res.status).toBe(400)
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('合法 notify 重送 → 只處理一次（第二次早退、不重複發卡）', async () => {
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(orderRow() as never)          // 第一次：PROCESSING
      .mockResolvedValue(orderRow({ status: 'PAID' }) as never)   // 之後：已 PAID
    stubRecordApi([tradeRecord()])

    const body = { order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }
    await POST(makeReq(body))
    for (let i = 0; i < 9; i++) await POST(makeReq(body))

    expect(markOrderPaid).toHaveBeenCalledTimes(1)
    expect(triggerEsimActivation).toHaveBeenCalledTimes(1)
  })
})

// Bundle：一筆 TapPay 交易付掉整組訂單（markBundlePaid 把同一個 rec_trade_id 寫進所有
// sibling）。因此期望金額是「整組加總」，不是 anchor 單張金額。
describe('P0-1 TapPay notify — Bundle 綁定', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TAPPAY_PARTNER_KEY', 'pk_test')
    vi.stubEnv('TAPPAY_MERCHANT_ID', 'mid_credit')
    vi.stubEnv('TAPPAY_ENV', 'sandbox')
    vi.mocked(prisma.order.aggregate).mockResolvedValue({ _sum: { totalPaid: 798 } } as never)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('整組加總金額相符 + order_number 為 anchor → 放行', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ bundleId: 'BDL-1' }) as never,
    )
    vi.mocked(markBundlePaid).mockResolvedValue(
      { orders: [{ id: 'oA' }, { id: 'oA2' }], changed: 2 } as never,
    )
    stubRecordApi([tradeRecord({ amount: 798 })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(markBundlePaid).toHaveBeenCalledWith('BDL-1', 'TXN-A', undefined)
    expect(triggerEsimActivation).toHaveBeenCalledTimes(2)
  })

  // F-8：markBundlePaid 回的是「現在是 PAID 的訂單」，會包含先前就已 PAID 的。
  // 兩個並發 worker 都拿得到非空清單 → 必須靠 changed 分辨誰是後手，否則付款成功通知
  // 會被推兩次（發卡另有 supplierOrderClaimedAt 搶佔把關，不會重複購卡）。
  it('並發：本次沒有真的轉移任何一筆（changed=0）→ 當成已處理，不重複發卡與通知', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ bundleId: 'BDL-1' }) as never,
    )
    vi.mocked(markBundlePaid).mockResolvedValue(
      { orders: [{ id: 'oA' }, { id: 'oA2' }], changed: 0 } as never,
    )
    stubRecordApi([tradeRecord({ amount: 798 })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(200)
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('交易金額只等於 anchor 單張金額（不是整組加總）→ 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ bundleId: 'BDL-1' }) as never,
    )
    stubRecordApi([tradeRecord({ amount: 399 })])

    const res = await POST(makeReq({ order_number: 'ESM-A', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markBundlePaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })

  it('bundle 交易的 order_number 屬於另一組 → 拒絕', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ id: 'oB', tapPayOrderId: 'ESM-B', bundleId: 'BDL-2' }) as never,
    )
    stubRecordApi([tradeRecord({ amount: 798, order_number: 'ESM-A' })])

    const res = await POST(makeReq({ order_number: 'ESM-B', status: 0, rec_trade_id: 'TXN-A' }))

    expect(res.status).toBe(400)
    expect(markBundlePaid).not.toHaveBeenCalled()
    expect(triggerEsimActivation).not.toHaveBeenCalled()
  })
})
