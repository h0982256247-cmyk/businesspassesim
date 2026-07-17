import { describe, it, expect, vi, beforeEach } from 'vitest'

// TapPay notify 是付款核心 webhook，先前無流程測試（ROADMAP P1）。
// 這支鎖住最關鍵的不變量：webhook 重送時，已 PAID/COMPLETED 的訂單必須在 route 第 61-63 行
// 早退，絕不可再次觸發發卡 / 分潤 / 發券（重送重複發卡是金流系統最不可接受的 bug）。
// 被測單元是整個 POST handler，故 mock 它 import 的所有 service + prisma；
// 不 mock '@prisma/client'，讓 OrderStatus enum 用真值。
vi.mock('@/lib/db/prisma', () => ({ prisma: { order: { findFirst: vi.fn() } } }))
vi.mock('@/lib/services/order', () => ({
  markOrderPaid: vi.fn(), markBundlePaid: vi.fn(), markOrderFailed: vi.fn(),
  markBundleFailed: vi.fn(), markOrderRefunded: vi.fn(), markOrderCancelled: vi.fn(),
  isOrderExpired: vi.fn(() => false),
}))
vi.mock('@/lib/services/esim', () => ({ triggerEsimActivation: vi.fn() }))
vi.mock('@/lib/services/commission', () => ({ calculateAndSaveCommission: vi.fn() }))
vi.mock('@/lib/services/coupon', () => ({ issueRepurchaseCouponForOrder: vi.fn() }))
vi.mock('@/lib/services/notification', () => ({ notifyOrderPaid: vi.fn() }))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn() }))
vi.mock('@/lib/utils/fire-and-log', () => ({ fireAndLog: vi.fn() }))
vi.mock('@/lib/services/tappay', () => ({ tapPayRefund: vi.fn(), tapPayQueryTrade: vi.fn() }))
vi.mock('@/lib/services/tappay-failure-reason', () => ({ mapTapPayFailureReason: vi.fn(() => 'x') }))

import { POST } from '@/app/api/payment/tappay/notify/route'
import { prisma } from '@/lib/db/prisma'
import { triggerEsimActivation } from '@/lib/services/esim'
import { calculateAndSaveCommission } from '@/lib/services/commission'
import { issueRepurchaseCouponForOrder } from '@/lib/services/coupon'
import { markOrderPaid, markOrderRefunded } from '@/lib/services/order'
import { tapPayQueryTrade, tapPayRefund } from '@/lib/services/tappay'

const makeReq = (body: unknown) => ({ json: async () => body }) as Parameters<typeof POST>[0]

const orderRow = (status: string) => ({
  id: 'o1', status, bundleId: null, totalPaid: 100,
  createdAt: new Date(), userId: 'u1',
  user: { tenantAdminId: 't1' }, orderItems: [],
})

describe('TapPay notify — 重送冪等（不重複發卡）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('已 PAID 的訂單再次收到 notify → 回「Already processed」，不再發卡/分潤/發券，也不重新驗真', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow('PAID') as never)

    const res = await POST(makeReq({ order_number: 'ESM-1', status: 0, rec_trade_id: 'R1' }))
    expect((await res.json()).message).toBe('Already processed')

    // 核心不變量：早退路徑完全不碰交付 side effect、也不重打 Record API
    expect(triggerEsimActivation).not.toHaveBeenCalled()
    expect(calculateAndSaveCommission).not.toHaveBeenCalled()
    expect(issueRepurchaseCouponForOrder).not.toHaveBeenCalled()
    expect(markOrderPaid).not.toHaveBeenCalled()
    expect(tapPayQueryTrade).not.toHaveBeenCalled()
  })

  it('已 COMPLETED 的訂單同樣早退、不重複發卡', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow('COMPLETED') as never)

    const res = await POST(makeReq({ order_number: 'ESM-2', status: 0, rec_trade_id: 'R2' }))
    expect((await res.json()).message).toBe('Already processed')
    expect(triggerEsimActivation).not.toHaveBeenCalled()
    expect(markOrderPaid).not.toHaveBeenCalled()
  })
})

// route 第 73-94 行的保護路徑：使用者取消後，銀行晚到的成功 notify 不可被當成正常付款發卡，
// 必須立即退款。對應 order.ts:465 註解「訂單已 CANCELLED → 自動退款保護路徑，不會誤發卡」。
describe('TapPay notify — 取消訂單收到晚到的成功 notify → 退款、不誤發卡', () => {
  beforeEach(() => vi.clearAllMocks())

  it('CANCELLED 訂單 + status=0（扣款成功）→ 立即退款、markOrderRefunded，絕不發卡/分潤/發券', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow('CANCELLED') as never)
    vi.mocked(tapPayRefund).mockResolvedValue({ ok: true } as never)

    const res = await POST(makeReq({ order_number: 'ESM-3', status: 0, rec_trade_id: 'R3' }))
    expect((await res.json()).message).toBe('Order expired; payment refunded')

    expect(tapPayRefund).toHaveBeenCalled()
    expect(markOrderRefunded).toHaveBeenCalledWith('o1')
    // 核心不變量：取消後即使扣款成功，也絕不發卡
    expect(triggerEsimActivation).not.toHaveBeenCalled()
    expect(markOrderPaid).not.toHaveBeenCalled()
  })
})
