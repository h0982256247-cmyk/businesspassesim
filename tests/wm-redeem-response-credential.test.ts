import { describe, it, expect, vi, beforeEach } from 'vitest'

// P0-4 Priority 1：3.1 兌換（/Api/OrderRedemption/redemption）是「我們自己發起、帶簽章的
// server→server 請求」，它的回應是 provider authoritative——比公開無簽章的 3.2 webhook
// 可信得多。舊程式只讀回應的 code、其餘整包丟掉，等於把唯一一個可信的憑證來源浪費掉。
//
// 改為：若 3.1 回應本身就帶 QR / LPA，立刻以它為準寫入（來源就是供應商，不再對格式
// 或網域二次設限）。之後 3.2 webhook 會因為憑證已存在而冪等早退。
// ⚠ 世界移動 3.1 是否真的會回憑證，repo 無法證明（Needs Provider Confirmation）：
//   沒回就是 undefined，行為與現況完全一致。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) } },
}))
vi.mock('@/lib/services/tenant-config', () => ({ getEsimConfig: vi.fn() }))
vi.mock('@/lib/services/order', () => ({ markOrderCompleted: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/services/notification', () => ({ notifyEsimPending: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/utils/crypto', () => ({
  encrypt: (v: string) => v, safeDecrypt: (v: string) => v, decrypt: (v: string) => v,
}))

import { triggerEsimRedemption } from '@/lib/services/esim'
import { prisma } from '@/lib/db/prisma'
import { getEsimConfig } from '@/lib/services/tenant-config'

const WM_HOST = 'https://tfmshippingsys.fastmove.com.tw'
const CFG = { apiUrl: WM_HOST, merchantId: 'M1', deptId: 'D1', token: 'TOK', isActive: true }

const orderRow = (o: Record<string, unknown> = {}) => ({
  id: 'o1', status: 'COMPLETED', esimRcode: 'RC-REAL', currentOwnerId: 'u1',
  esimQrcode: null, esimLpa: null, redeemedAt: null, activatedAt: null,
  ...o,
})

const credentialWrite = () =>
  vi.mocked(prisma.order.updateMany).mock.calls
    .map(c => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
    .find(c => 'esimLpa' in c.data || 'esimQrcode' in c.data)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(getEsimConfig).mockResolvedValue(CFG as never)
})

describe('P0-4 Priority 1 — 3.1 兌換回應若帶憑證即為 authoritative 來源', () => {
  it('3.1 回應帶 QR / LPA → 立刻以供應商回應為準寫入（條件式，不覆蓋既有憑證）', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(orderRow() as never)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        code: 0,
        qrcode: `${WM_HOST}/tApi/images/authoritative.jpg`,
        qrcodeContent: 'LPA:1$rsp.esim.pub$AUTHORITATIVE-ID',
        iccid: 'ICCID-REAL', pin1: '1111',
      }),
    })))

    const r = await triggerEsimRedemption('o1', 'u1')

    expect(r.ok).toBe(true)
    const write = credentialWrite()
    expect(write?.data).toMatchObject({
      esimQrcode: `${WM_HOST}/tApi/images/authoritative.jpg`,
      esimLpa: 'LPA:1$rsp.esim.pub$AUTHORITATIVE-ID',
      esimIccid: 'ICCID-REAL',
    })
    // 不可覆蓋既有憑證
    expect(write?.where).toMatchObject({ id: 'o1', esimQrcode: null, esimLpa: null })
  })

  it('3.1 回應把憑證包在 data 裡 → 一樣抓得到', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(orderRow() as never)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ code: 0, data: { qrcodeContent: 'LPA:1$rsp.esim.pub$NESTED-ID' } }),
    })))

    await triggerEsimRedemption('o1', 'u1')

    expect(credentialWrite()?.data).toMatchObject({ esimLpa: 'LPA:1$rsp.esim.pub$NESTED-ID' })
  })

  it('3.1 回應的 LPA 照原樣寫入，不做格式或網域二次驗證（來源即供應商）', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(orderRow() as never)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ code: 0, qrcodeContent: 'LPA:1$rsp.whatever-domain.tw$X1' }),
    })))

    await triggerEsimRedemption('o1', 'u1')

    expect(credentialWrite()?.data).toMatchObject({ esimLpa: 'LPA:1$rsp.whatever-domain.tw$X1' })
  })

  it('3.1 回應沒帶憑證（目前實測的行為）→ 只寫 redeemedAt，流程與現況一致', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(orderRow() as never)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ code: 0, msg: 'success' }),
    })))

    const r = await triggerEsimRedemption('o1', 'u1')

    expect(r.ok).toBe(true)
    // F-11：redeemedAt 改條件式寫入，where 必須同時帶「仍是這個擁有者」與「尚未兌換」
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'o1', currentOwnerId: 'u1', redeemedAt: null },
        data: { redeemedAt: expect.any(Date) },
      }),
    )
    expect(credentialWrite()).toBeUndefined()
  })

  it('3.1 失敗（code 非 0）→ 不寫任何東西', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(orderRow() as never)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ code: 500, msg: '兌換失敗' }),
    })))

    const r = await triggerEsimRedemption('o1', 'u1')

    expect(r.ok).toBe(false)
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
    expect(credentialWrite()).toBeUndefined()
  })
})
