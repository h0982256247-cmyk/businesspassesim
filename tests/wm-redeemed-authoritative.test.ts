import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// P0-4：/api/webhooks/wm/esim-redeemed（世界移動 3.2 兌換 callback）是網際網路上任何人
// 都打得到的公開端點，且 WM 不提供簽章。舊行為直接把 body 的 qrcode / qrcodeContent(LPA) /
// iccid / pin / puk 寫進 DB——只要知道一組合法 rcode，就能把攻擊者自己的 QR / LPA 灌進
// 使用者的訂單（受害者掃到的是攻擊者控制的 eSIM profile）。
//
// 現行取捨（重要，不要「修」回去）：完整綁定驗真曾經上線過，但世界移動的 QR 圖片網域
// 與 SM-DP+ 網域都不等於 API 主機網域、對方也無法提供正式清單，把網域比對當閘門的結果是
// 「合法 callback 全被擋、沒人拿得到 QR」，而訂單一旦 COMPLETED 就沒有自動補救路徑。
// 因此改為：
//   回查（2.3 querybuyesim，帶簽章）查得到 → 以回查值為準
//   查不到／rcode 對不上          → 照 body 原樣寫入，並記一筆 warn 告警（不阻斷交付）
// 殘餘風險是「知道 rcode 的人可以劫持安裝內容」；但 rcode 本身就能直接去 WM 兌換掉那張卡，
// 所以真正的防線是 esimRcode 不外流（redactEsimCredentials），不是這裡。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) } },
}))
vi.mock('@/lib/services/notification', () => ({ notifyEsimReady: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/services/tenant-config', () => ({ getEsimConfig: vi.fn() }))
// 憑證欄位平常會加密落地；測試用直通版本，才能直接斷言「寫進去的是什麼值」
vi.mock('@/lib/utils/crypto', () => ({
  encrypt: (v: string) => v, safeDecrypt: (v: string) => v, decrypt: (v: string) => v,
}))
// 只換掉 fetchEsimCodes（authoritative 回查）；verifyRedeemedCredential 走真實實作
vi.mock('@/lib/services/esim', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/esim')>()),
  fetchEsimCodes: vi.fn(),
}))

import { POST as esimRedeemed } from '@/app/api/webhooks/wm/esim-redeemed/route'
import { prisma } from '@/lib/db/prisma'
import { fetchEsimCodes } from '@/lib/services/esim'
import { getEsimConfig } from '@/lib/services/tenant-config'
import { notifyEsimReady } from '@/lib/services/notification'
import { recordAlert } from '@/lib/services/alert'

const req = (body: unknown) => ({ json: async () => body }) as Parameters<typeof esimRedeemed>[0]

const WM_HOST = 'https://tfmshippingsys.fastmove.com.tw'
const CFG = { apiUrl: WM_HOST, merchantId: 'M1', deptId: 'D1', token: 'TOK', isActive: true }

const orderRow = (o: Record<string, unknown> = {}) => ({
  id: 'o1', userId: 'u1', currentOwnerId: 'u1', status: 'COMPLETED',
  esimRcode: 'RC-REAL', esimQrcode: null, esimLpa: null, wmOrderId: 'WM-1',
  redeemedAt: new Date(),
  orderItems: [{ productName: '日本 3天', product: { countryNameZh: '日本', displayDays: 3, dataCapacity: '1GB' } }],
  ...o,
})

// 供應商 2.3 回查結果（authoritative）：目前確定會回 redemptionCode + iccid
const supplierResult = (o: Record<string, unknown> = {}) => ({
  wmOrderId: 'WM-1', esimRcode: 'RC-REAL', esimIccid: 'ICCID-REAL', ...o,
})

// 合法的 3.2 payload（QR 圖片在 WM 自己的網域上）
const goodBody = (o: Record<string, unknown> = {}) => ({
  rcode: 'RC-REAL', resultcode: '000', qrcodeType: 2,
  qrcode: `${WM_HOST}/tApi/images/real_qr.jpg`,
  qrcodeContent: 'LPA:1$rsp.truphone.com$REAL-MATCHING-ID',
  iccid: 'ICCID-REAL', pin1: '1111', puk1: '33334444',
  cfCode: '849372', apnExplain: 'rsp.demo.com',
  ...o,
})

const written = () => {
  const call = vi.mocked(prisma.order.updateMany).mock.calls[0]
  return (call?.[0] as { data: Record<string, unknown> } | undefined)?.data
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(getEsimConfig).mockResolvedValue(CFG as never)
  vi.mocked(fetchEsimCodes).mockResolvedValue(supplierResult() as never)
})

afterEach(() => vi.unstubAllEnvs())

describe('P0-4 WM 3.2 兌換 callback — body 不得成為 credential 來源', () => {
  it('合法訊號 → 先向供應商回查（帶本地訂單的 wmOrderId），再寫入', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req(goodBody()))

    expect(await res.text()).toBe('1')
    expect(fetchEsimCodes).toHaveBeenCalledWith('WM-1')
    expect(written()).toMatchObject({ esimIccid: 'ICCID-REAL' })
    expect(notifyEsimReady).toHaveBeenCalled()
  })

  // ★ 已接受的殘餘風險（不是漏洞，是取捨）：2.3 回查目前不回 QR/LPA，所以這兩個欄位
  //   只能取自 body。知道 rcode 的人可以換掉安裝內容——但知道 rcode 就已經能直接去 WM
  //   把卡兌換掉，所以這條路徑增加的是「劫持」而非「竊取」。防線在 rcode 不外流。
  //   這幾個測試是刻意存在的：如果哪天有人加回網域白名單而沒有先確認 WM 的實際網域，
  //   它們會失敗，並提醒對方回頭看檔頭的取捨說明。
  it('回查沒有 QR 時，body 的 QR 照原樣寫入（已接受的殘餘風險，見檔頭取捨）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req(goodBody({ qrcode: 'https://other-cdn.example/qr.png' })))

    expect(await res.text()).toBe('1')
    expect(written()).toMatchObject({ esimQrcode: 'https://other-cdn.example/qr.png' })
  })

  it('回查沒有 LPA 時，body 的 LPA 照原樣寫入，不做格式檢查', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req(goodBody({ qrcodeContent: 'LPA:1$rsp.whatever.tw$X1' })))

    expect(await res.text()).toBe('1')
    expect(written()).toMatchObject({ esimLpa: 'LPA:1$rsp.whatever.tw$X1' })
  })

  it('ICCID 以回查為準：body 給不同值時採用回查值，不因此拒絕整包', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req(goodBody({ iccid: 'ICCID-FAKE' })))

    expect(await res.text()).toBe('1')
    expect(written()).toMatchObject({ esimIccid: 'ICCID-REAL' })
  })

  it('供應商回查有帶憑證時，一律以供應商為準（body 的偽造 PIN/PUK/QR 不落地）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    vi.mocked(fetchEsimCodes).mockResolvedValue(supplierResult({
      esimQrcode: `${WM_HOST}/tApi/images/authoritative.jpg`,
      esimLpa: 'LPA:1$rsp.truphone.com$AUTHORITATIVE',
      esimPin1: '0000', esimPuk1: '12345678',
    }) as never)

    await esimRedeemed(req(goodBody({ pin1: '9999', puk1: '88887777' })))

    expect(written()).toMatchObject({
      esimQrcode: `${WM_HOST}/tApi/images/authoritative.jpg`,
      esimLpa: 'LPA:1$rsp.truphone.com$AUTHORITATIVE',
      esimPin1: '0000', esimPuk1: '12345678',
    })
  })

  it('供應商回查的 rcode 與本地訂單不符 → 不採用回查值，改用 body 並記 warn 告警', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    vi.mocked(fetchEsimCodes).mockResolvedValue(
      supplierResult({ esimRcode: 'RC-OTHER', esimIccid: 'ICCID-OTHER' }) as never,
    )

    const res = await esimRedeemed(req(goodBody()))

    expect(await res.text()).toBe('1')
    // 對不上的回查值一律不採用（ICCID 走 body），但交付不中斷
    expect(written()).toMatchObject({ esimIccid: 'ICCID-REAL' })
    expect(recordAlert).toHaveBeenCalledWith(
      'wm_redeemed_query_unverified',
      expect.objectContaining({ reason: 'supplier_rcode_mismatch' }),
    )
  })

  it('供應商回查失敗 → 仍照 body 寫入（不讓 WM 掛掉就發不出卡），但記 warn 告警', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    vi.mocked(fetchEsimCodes).mockResolvedValue(null as never)

    const res = await esimRedeemed(req(goodBody()))

    expect(await res.text()).toBe('1')
    expect(written()).toMatchObject({
      esimQrcode: `${WM_HOST}/tApi/images/real_qr.jpg`,
      esimLpa: 'LPA:1$rsp.truphone.com$REAL-MATCHING-ID',
    })
    expect(recordAlert).toHaveBeenCalledWith(
      'wm_redeemed_query_unverified',
      expect.objectContaining({ reason: 'supplier_query_failed' }),
    )
  })

  it('本地訂單還沒有 wmOrderId（無法回查驗真）→ 不寫入', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow({ wmOrderId: null }) as never)

    const res = await esimRedeemed(req(goodBody()))

    expect(res.status).toBe(503)
    expect(fetchEsimCodes).not.toHaveBeenCalled()
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('亂序／重播：我們尚未觸發兌換（redeemedAt 為 null）就收到 3.2 → 不寫入，等重送', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow({ redeemedAt: null }) as never)

    const res = await esimRedeemed(req(goodBody()))

    expect(res.status).toBe(503)
    expect(prisma.order.updateMany).not.toHaveBeenCalled()

    // 我們觸發兌換之後，同一則 webhook 重送就能正常完成（自我修復，不會卡死）
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    const res2 = await esimRedeemed(req(goodBody()))
    expect(await res2.text()).toBe('1')
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1)
  })

  it('rcode 對不到任何訂單 → 安全略過，不回查、不寫入、不洩漏資訊', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)

    const res = await esimRedeemed(req(goodBody({ rcode: 'RC-UNKNOWN' })))

    expect(await res.text()).toBe('1')
    expect(fetchEsimCodes).not.toHaveBeenCalled()
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('重複的 redeemed webhook → 冪等：不回查、不覆寫既有憑證', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow({ esimQrcode: '既有真 QR' }) as never)

    const res = await esimRedeemed(req(goodBody({ qrcode: `${WM_HOST}/tApi/images/other.jpg` })))

    expect(await res.text()).toBe('1')
    expect(fetchEsimCodes).not.toHaveBeenCalled()
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('殘缺 payload（只有 rcode）不得清空既有憑證', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow({ esimQrcode: '既有真 QR' }) as never)

    await esimRedeemed(req({ rcode: 'RC-REAL' }))

    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('殘缺 payload（無 QR 也無 LPA）在未寫過憑證的訂單上 → 不寫空白', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req({ rcode: 'RC-REAL', resultcode: '000' }))

    expect(res.status).toBe(503)
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('兌換失敗的通知（resultcode 非 000）→ 不回查、不寫入', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req(goodBody({ resultcode: '999', resultmsg: 'failed' })))

    expect(await res.text()).toBe('1')
    expect(fetchEsimCodes).not.toHaveBeenCalled()
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('已退款訂單 → 不回查、不寫憑證、不推通知（維持既有守門）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow({ status: 'REFUNDED' }) as never)

    const res = await esimRedeemed(req(goodBody()))

    expect(await res.text()).toBe('1')
    expect(fetchEsimCodes).not.toHaveBeenCalled()
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
    expect(notifyEsimReady).not.toHaveBeenCalled()
  })

  it('並發重複 webhook：寫入條件帶 esimQrcode 為 null，只有一個能寫成功', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    await esimRedeemed(req(goodBody()))

    const call = vi.mocked(prisma.order.updateMany).mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where).toMatchObject({ id: 'o1', esimQrcode: null })
  })
})

// ─── 憑證來源優先權 ─────────────────────────────────────────────
// 回查（2.3）有值就用回查的，沒有就用 body 的。曾經在這一層加過 SM-DP+ 網域白名單，
// 因為無法取得世界移動的正式網域清單而移除（見檔頭取捨），這個 describe 現在只保證
// 「優先權正確」與「不覆寫既有憑證」。
describe('P0-4 憑證來源優先權 — 回查優先，回查不到才用 callback', () => {
  it('回查沒帶 LPA → 採用 body 的 LPA，一鍵安裝可用', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimRedeemed(req(goodBody()))

    expect(await res.text()).toBe('1')
    expect(written()).toMatchObject({ esimLpa: 'LPA:1$rsp.truphone.com$REAL-MATCHING-ID' })
  })

  it('回查有帶 LPA → 一律以回查為準，body 的值不落地', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    vi.mocked(fetchEsimCodes).mockResolvedValue(supplierResult({
      esimLpa: 'LPA:1$rsp.authoritative.example$AUTHORITATIVE-ID',
    }) as never)

    await esimRedeemed(req(goodBody({ qrcodeContent: 'LPA:1$rsp.attacker.example$FAKE' })))

    expect(written()).toMatchObject({ esimLpa: 'LPA:1$rsp.authoritative.example$AUTHORITATIVE-ID' })
  })

  it('回查有帶 QR/PIN/PUK → 一律以回查為準，body 的偽造值不落地', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)
    vi.mocked(fetchEsimCodes).mockResolvedValue(supplierResult({
      esimQrcode: `${WM_HOST}/tApi/images/authoritative.jpg`,
      esimPin1: '0000', esimPuk1: '12345678',
    }) as never)

    await esimRedeemed(req(goodBody({ pin1: '9999', puk1: '88887777' })))

    expect(written()).toMatchObject({
      esimQrcode: `${WM_HOST}/tApi/images/authoritative.jpg`,
      esimPin1: '0000', esimPuk1: '12345678',
    })
  })

  it('轉贈領走後：通知寄給目前擁有者，不是原買家（F-7）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ userId: 'buyer-A', currentOwnerId: 'recipient-B' }) as never,
    )

    await esimRedeemed(req(goodBody()))

    expect(notifyEsimReady).toHaveBeenCalledWith('recipient-B', expect.anything(), expect.anything())
  })

  it('currentOwnerId 為歷史 NULL → 退回原買家，不因此漏發通知', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ userId: 'buyer-A', currentOwnerId: null }) as never,
    )

    await esimRedeemed(req(goodBody()))

    expect(notifyEsimReady).toHaveBeenCalledWith('buyer-A', expect.anything(), expect.anything())
  })

  it('已存在 LPA（即使還沒有 QR）→ webhook 不得覆寫', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ esimQrcode: null, esimLpa: 'LPA:1$rsp.truphone.com$EXISTING' }) as never,
    )

    const res = await esimRedeemed(req(goodBody({ qrcodeContent: 'LPA:1$rsp.truphone.com$REPLACED' })))

    expect(await res.text()).toBe('1')
    expect(fetchEsimCodes).not.toHaveBeenCalled()
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('重播的 callback 不得置換既有 LPA：寫入條件同時帶 esimQrcode 與 esimLpa 為 null', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    await esimRedeemed(req(goodBody()))

    const call = vi.mocked(prisma.order.updateMany).mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where).toMatchObject({ id: 'o1', esimQrcode: null, esimLpa: null })
  })
})
