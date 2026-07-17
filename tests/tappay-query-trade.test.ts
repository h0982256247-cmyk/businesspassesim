import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// tappay service import 時不會 throw（getConfig 只在執行期呼叫），但仍 mock prisma
// 讓 tenantAdminId=null 時走 env config、不碰 DB。
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { tapPayQueryTrade } from '@/lib/services/tappay'

const REC = 'D20260613k7PLTW'

describe('tapPayQueryTrade — Record API 驗真', () => {
  beforeEach(() => {
    vi.stubEnv('TAPPAY_PARTNER_KEY', 'pk_test')
    vi.stubEnv('TAPPAY_MERCHANT_ID', 'mid_test')
    vi.stubEnv('TAPPAY_ENV', 'sandbox')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('回歸：status=2（"End of list"）但 trade_records 有資料 → 視為查到、ok:true', async () => {
    // TapPay Record API 即使查到也常回 status=2，舊判斷 `if (data.status!==0) fail`
    // 把成功通知打成驗真失敗、訂單卡 PROCESSING。此測試鎖住正確行為。
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        status: 2,
        msg: 'End of list',
        trade_records: [
          { rec_trade_id: REC, amount: 103, order_number: 'ESM-260613-AEKF4Q', record_status: 0 },
        ],
      }),
    }))

    const r = await tapPayQueryTrade(REC, null)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.amount).toBe(103)
      expect(r.recordStatus).toBe(0)
      expect(r.orderNumber).toBe('ESM-260613-AEKF4Q')
    }
  })

  it('trade_records 為空 → ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ status: 2, msg: 'End of list', trade_records: [] }),
    }))
    const r = await tapPayQueryTrade(REC, null)
    expect(r.ok).toBe(false)
  })

  it('沒帶 rec_trade_id → ok:false，且不打 API', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const r = await tapPayQueryTrade('', null)
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
})
