import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// P0-2（F-06）：退款必須用「該訂單實際付款的 gateway」的商店設定。
// 後台手動退款是除了 TapPay notify 之外的第二個退款入口，過去同樣走寫死的
// tappay_credit——LINE Pay 訂單會拿信用卡的 partner_key / merchant_id 去退款。
// 這支鎖住兩個入口用的是同一條規則（tapPayGatewayFor(Order.paymentMethod)）。
//
// 後台退款的 rec_trade_id 來自 DB（Order.tapPayRecTradeId，由 P0-1 驗真過的付款流程寫入），
// 不是來自不可信輸入，故此處只驗 gateway 選擇，不重打 Record API。
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    order: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
  },
}))
vi.mock('@/lib/auth/platform', () => ({ requirePlatformAuth: vi.fn(async () => ({ adminId: 'a1' })) }))
vi.mock('@/lib/services/esim', () => ({ retryEsimActivation: vi.fn() }))
vi.mock('@/lib/services/tenant-config', () => ({
  getPaymentConfig: vi.fn(async (gateway: string) => ({
    tappay_credit: { partnerKey: 'pk_credit', merchantId: 'mid_credit', env: 'sandbox', isActive: true },
    tappay_linepay: { partnerKey: 'pk_linepay', merchantId: 'mid_linepay', env: 'sandbox', isActive: true },
  }[gateway] ?? null)),
}))

import { PATCH } from '@/app/api/platform/orders/[id]/route'
import { prisma } from '@/lib/db/prisma'

const makeReq = (body: unknown) => ({ json: async () => body }) as Parameters<typeof PATCH>[0]
const params = { params: Promise.resolve({ id: 'oA' }) }

let calls: { url: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return { json: async () => ({ status: 0 }) }
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('P0-2 後台退款 — gateway 必須依 Order.paymentMethod 決定', () => {
  it('信用卡訂單 → 用信用卡商店設定退款', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'oA', bundleId: null, tapPayRecTradeId: 'TXN-A', refundedAmount: 0, paymentMethod: 'CREDIT_CARD',
    } as never)
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'oA', status: 'COMPLETED', totalPaid: 399 },
    ] as never)

    const res = await PATCH(makeReq({ action: 'refund' }), params)

    expect(res.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/transaction/refund')
    expect(calls[0].body.partner_key).toBe('pk_credit')
  })

  it('LINE Pay 訂單 → 必須用 LINE Pay 商店設定，不可用信用卡設定', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'oA', bundleId: null, tapPayRecTradeId: 'TXN-A', refundedAmount: 0, paymentMethod: 'LINE_PAY',
    } as never)
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'oA', status: 'COMPLETED', totalPaid: 399 },
    ] as never)

    const res = await PATCH(makeReq({ action: 'refund' }), params)

    expect(res.status).toBe(200)
    expect(calls[0].body.partner_key).toBe('pk_linepay')
  })

  it('LINE Pay 訂單的部分退款 → 同樣用 LINE Pay 商店設定', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'oA', bundleId: null, tapPayRecTradeId: 'TXN-A', refundedAmount: 0, paymentMethod: 'LINE_PAY',
    } as never)
    vi.mocked(prisma.order.findMany).mockResolvedValue([
      { id: 'oA', status: 'COMPLETED', totalPaid: 399 },
    ] as never)

    const res = await PATCH(makeReq({ action: 'refund_partial', amount: 100 }), params)

    expect(res.status).toBe(200)
    expect(calls[0].body.partner_key).toBe('pk_linepay')
    expect(calls[0].body.amount).toBe(100)
  })
})
