import { describe, it, expect, vi, beforeEach } from 'vitest'

// P0-5：「看得到訂單」不等於「看得到訂單裡所有欄位」。
//
// 轉贈後 Order.userId（原購買者）與 Order.currentOwnerId（目前擁有者）會分家，但
// getUserOrders / getOrderByIdForUser 的存取條件是 `OR: [currentOwnerId, userId]`，
// 兩支都把 esimRcode / esimQrcode / esimLpa / esimIccid 無條件回傳——原買家在轉贈之後
// 仍拿得到完整憑證，等於可以自己安裝或去 WM 兌換掉已經送出去的卡。
//
// 核心不變量：只有 currentOwnerId 對應的使用者可以取得可安裝／可兌換／可控制 eSIM 的資料；
// 原購買者只保留歷史 metadata（商品、金額、訂單編號、日期、轉贈紀錄）。
// 且必須在 server response 就拿掉，不是前端隱藏。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findMany: vi.fn(), findFirst: vi.fn() } },
}))
// 憑證欄位平常加密落地；測試用直通版本，方便直接斷言值
vi.mock('@/lib/utils/crypto', () => ({
  encrypt: (v: string) => v, safeDecrypt: (v: string) => v, decrypt: (v: string) => v,
}))

import { getUserOrders, getOrderByIdForUser } from '@/lib/services/order'
import { prisma } from '@/lib/db/prisma'

const BUYER = 'user_A'
const RECIPIENT = 'user_B'

// 所有「可直接安裝／兌換／控制 eSIM」的欄位——一個都不能漏
const CREDENTIAL_FIELDS = [
  'esimRcode', 'esimQrcode', 'esimLpa', 'esimIccid',
  'esimPin1', 'esimPin2', 'esimPuk1', 'esimPuk2',
] as const

const CREDENTIALS = {
  esimRcode: 'RC-SECRET',
  esimQrcode: 'https://wm.example/qr.jpg',
  esimLpa: 'LPA:1$rsp.esim.pub$MATCHING-ID',
  esimIccid: '8988000000000000001',
  esimPin1: '1111', esimPin2: '2222', esimPuk1: '33334444', esimPuk2: '55556666',
}

// listRow：getUserOrders 的 select 沒有 esimLpa / pin / puk（列表用不到），
// detailRow：getOrderByIdForUser 有 esimLpa。兩支都要測。
const listRow = (o: Record<string, unknown> = {}) => ({
  id: 'ord_1', orderNumber: 'ESM-260101-AAAAAA', status: 'COMPLETED',
  totalPaid: 399, subtotal: 399, priceTier: 'GENERAL', paymentMethod: 'CREDIT_CARD',
  paidAt: new Date(), createdAt: new Date(),
  userId: BUYER, currentOwnerId: BUYER, bundleId: null,
  failureReason: null, cancelReason: null,
  esimRcode: CREDENTIALS.esimRcode, esimQrcode: CREDENTIALS.esimQrcode, esimIccid: CREDENTIALS.esimIccid,
  activationStart: null, activationEnd: null, redeemedAt: null, activatedAt: null,
  orderItems: [{ productName: '日本 3天', qty: 1, unitPrice: 399, product: { countryNameZh: '日本', countryNameEn: 'Japan', displayDays: 3, dataCapacity: '1GB' } }],
  transfer: null,
  ...o,
})

const detailRow = (o: Record<string, unknown> = {}) => ({
  ...listRow(),
  updatedAt: new Date(),
  esimLpa: CREDENTIALS.esimLpa,
  esimPin1: CREDENTIALS.esimPin1, esimPin2: CREDENTIALS.esimPin2,
  esimPuk1: CREDENTIALS.esimPuk1, esimPuk2: CREDENTIALS.esimPuk2,
  ...o,
})

// 已被 B 領走的轉贈紀錄
const claimedTransfer = {
  claimedAt: new Date(), cancelledAt: null, expiresAt: new Date(Date.now() + 86400000),
  fromUser: { displayName: 'A' }, toUser: { displayName: 'B' },
}
const pendingTransfer = { ...claimedTransfer, claimedAt: null }

// 斷言：回應裡不能出現任何憑證值（含加密後的原值意外外流）
const expectNoCredentialValues = (payload: unknown) => {
  const json = JSON.stringify(payload)
  for (const v of Object.values(CREDENTIALS)) expect(json).not.toContain(v)
}

beforeEach(() => vi.clearAllMocks())

describe('P0-5 訂單列表 — 憑證只給目前擁有者', () => {
  it('目前擁有者（未轉贈的買家）→ 拿得到憑證', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([listRow()] as never)

    const [o] = await getUserOrders(BUYER)

    expect(o.esimRcode).toBe(CREDENTIALS.esimRcode)
    expect(o.esimQrcode).toBe(CREDENTIALS.esimQrcode)
    expect(o.esimIccid).toBe(CREDENTIALS.esimIccid)
  })

  it('轉贈已建立但對方還沒領取（A 仍是 currentOwner）→ A 仍拿得到憑證', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      [listRow({ currentOwnerId: BUYER, transfer: pendingTransfer })] as never,
    )

    const [o] = await getUserOrders(BUYER)

    expect(o.esimRcode).toBe(CREDENTIALS.esimRcode)
    expect(o.esimQrcode).toBe(CREDENTIALS.esimQrcode)
  })

  // ★ 核心：B 領走之後，A 的列表不得再帶任何憑證
  it('對方領取後 → 原買家的列表不得帶任何憑證欄位', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      [listRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer })] as never,
    )

    const [o] = await getUserOrders(BUYER)

    for (const f of CREDENTIAL_FIELDS) {
      expect(o[f as keyof typeof o] ?? null).toBeNull()
    }
    expectNoCredentialValues(o)
  })

  it('對方領取後 → 原買家仍保有歷史 metadata（商品／金額／訂單編號／轉贈紀錄）', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      [listRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer })] as never,
    )

    const [o] = await getUserOrders(BUYER)

    expect(o.orderNumber).toBe('ESM-260101-AAAAAA')
    expect(o.totalPaid).toBe(399)
    expect(o.paymentMethod).toBe('CREDIT_CARD')
    expect(o.orderItems[0].productName).toBe('日本 3天')
    expect(o.transferredAway).toBe(true)
    expect(o.gift?.toName).toBe('B')
  })

  it('領取者 → 拿得到憑證', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      [listRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer })] as never,
    )

    const [o] = await getUserOrders(RECIPIENT)

    expect(o.esimRcode).toBe(CREDENTIALS.esimRcode)
    expect(o.esimQrcode).toBe(CREDENTIALS.esimQrcode)
    expect(o.receivedGift).toBe(true)
  })

  it('轉贈後原買家仍看得到「這張卡進行到哪一步」，但那只是布林值、不是憑證', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      [listRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer })] as never,
    )

    const [o] = await getUserOrders(BUYER)

    expect(o.hasEsimRcode).toBe(true)
    expect(o.hasEsimQrcode).toBe(true)
    expectNoCredentialValues(o)
  })
})

describe('P0-5 訂單詳情 — 憑證只給目前擁有者', () => {
  it('目前擁有者 → 拿得到完整憑證（含 LPA / PIN / PUK）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(detailRow() as never)

    const o = await getOrderByIdForUser('ord_1', BUYER)

    expect(o?.isCurrentOwner).toBe(true)
    expect(o?.esimLpa).toBe(CREDENTIALS.esimLpa)
    expect(o?.esimQrcode).toBe(CREDENTIALS.esimQrcode)
    expect(o?.esimRcode).toBe(CREDENTIALS.esimRcode)
  })

  it('轉贈待領取（A 仍是 currentOwner）→ A 仍拿得到憑證', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      detailRow({ currentOwnerId: BUYER, transfer: pendingTransfer }) as never,
    )

    const o = await getOrderByIdForUser('ord_1', BUYER)

    expect(o?.esimLpa).toBe(CREDENTIALS.esimLpa)
  })

  // ★ 核心：包含一鍵安裝要用的 LPA（derived install URL 由它產生）
  it('對方領取後 → 原買家的詳情不得帶 LPA / QR / RCode / ICCID / PIN / PUK', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      detailRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer }) as never,
    )

    const o = await getOrderByIdForUser('ord_1', BUYER)

    expect(o?.isCurrentOwner).toBe(false)
    expect(o?.transferredAway).toBe(true)
    for (const f of CREDENTIAL_FIELDS) {
      expect((o as Record<string, unknown>)[f] ?? null).toBeNull()
    }
    expectNoCredentialValues(o)
  })

  it('對方領取後 → 原買家的詳情仍保有歷史 metadata', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      detailRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer }) as never,
    )

    const o = await getOrderByIdForUser('ord_1', BUYER)

    expect(o?.orderNumber).toBe('ESM-260101-AAAAAA')
    expect(o?.totalPaid).toBe(399)
    expect(o?.paidAt).toBeTruthy()
    expect(o?.gift?.toName).toBe('B')
  })

  it('領取者 → 拿得到完整憑證', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      detailRow({ currentOwnerId: RECIPIENT, transfer: claimedTransfer }) as never,
    )

    const o = await getOrderByIdForUser('ord_1', RECIPIENT)

    expect(o?.isCurrentOwner).toBe(true)
    expect(o?.esimLpa).toBe(CREDENTIALS.esimLpa)
    expect(o?.esimPin1).toBe(CREDENTIALS.esimPin1)
    expect(o?.esimPuk1).toBe(CREDENTIALS.esimPuk1)
  })

  it('無關第三人 → 連訂單都查不到（where 就帶擁有者條件，不是事後過濾）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)

    const o = await getOrderByIdForUser('ord_1', 'user_C')

    expect(o).toBeNull()
    const where = (vi.mocked(prisma.order.findFirst).mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where).toMatchObject({ id: 'ord_1', OR: [{ currentOwnerId: 'user_C' }, { userId: 'user_C' }] })
  })
})
