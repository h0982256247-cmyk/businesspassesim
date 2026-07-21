import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// 補發（retryEsimActivation）在「已下單但沒收到 2.2 callback」時，要用世界移動文件 2.3
// 「eSIM 訂單查詢」主動補抓兌換碼。此測試鎖住這次修對的三件事：
//   端點 /Api/SOrder/querybuyesim、簽章 SHA1(merchantId+orderId+token) 放 body encStr、
//   回應 itemList[0].redemptionCode → esimRcode（曾經整套寫錯導致補發永遠 404 空轉）。
vi.mock('@/lib/db/prisma', () => ({ prisma: { order: { findUnique: vi.fn() } } }))
vi.mock('@/lib/services/tenant-config', () => ({ getEsimConfig: vi.fn() }))
vi.mock('@/lib/services/order', () => ({ markOrderCompleted: vi.fn() }))
vi.mock('@/lib/services/notification', () => ({ notifyEsimPending: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn(() => Promise.resolve()) }))

import { retryEsimActivation } from '@/lib/services/esim'
import { prisma } from '@/lib/db/prisma'
import { getEsimConfig } from '@/lib/services/tenant-config'
import { markOrderCompleted } from '@/lib/services/order'
import { recordAlert } from '@/lib/services/alert'

const CFG = { apiUrl: 'https://tfmshippingsys.fastmove.com.tw', merchantId: 'M1', deptId: 'D1', token: 'TOK', isActive: true }

describe('retryEsimActivation — 2.3 eSIM 訂單查詢補抓兌換碼', () => {
  beforeEach(() => vi.clearAllMocks())

  it('有 wmOrderId → 打 querybuyesim（正確簽章），把 redemptionCode 寫成 esimRcode', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ wmOrderId: 'b0000f0-WM1' } as never)
    vi.mocked(getEsimConfig).mockResolvedValue(CFG as never)
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ code: 0, msg: null, orderSN: 'SN1', orderTime: 'T1', itemList: [{ iccid: 'IC1', redemptionCode: 'RC1', wmproductId: 'WM_1' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await retryEsimActivation('order1')

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('https://tfmshippingsys.fastmove.com.tw/Api/SOrder/querybuyesim')
    const expectSign = crypto.createHash('sha1').update('M1' + 'b0000f0-WM1' + 'TOK').digest('hex')
    expect(JSON.parse(init.body)).toEqual({ merchantId: 'M1', orderId: 'b0000f0-WM1', encStr: expectSign })
    expect(markOrderCompleted).toHaveBeenCalledWith('order1', expect.objectContaining({
      esimRcode: 'RC1', esimIccid: 'IC1', wmOrderSn: 'SN1', wmOrderTime: 'T1',
    }))
  })

  it('WM 回 code 非 0 → 記 wm_query_failed 告警、不標 COMPLETED（不再靜默吞錯）', async () => {
    // 第一次 findUnique 給 retry 用（{wmOrderId}）；第二次給內部 triggerEsimActivation 用
    // （{userId, wmOrderId, orderItems}）→ 其 wmOrderId 已存在會冪等 return。
    vi.mocked(prisma.order.findUnique)
      .mockResolvedValueOnce({ wmOrderId: 'b0000f0-WM2' } as never)
      .mockResolvedValueOnce({ userId: 'u1', wmOrderId: 'b0000f0-WM2', orderItems: [{ productName: 'X' }] } as never)
    vi.mocked(getEsimConfig).mockResolvedValue(CFG as never)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ code: 409, msg: 'not ready' }) })))

    await retryEsimActivation('order2')

    expect(recordAlert).toHaveBeenCalledWith('wm_query_failed', expect.objectContaining({ wmCode: 409 }))
    expect(markOrderCompleted).not.toHaveBeenCalled()
  })
})
