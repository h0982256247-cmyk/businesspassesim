import { describe, it, expect, vi, beforeEach } from 'vitest'

// 修復回歸：退款/取消後，WM 晚到的 callback 與使用者 redeem 都不可「復活」訂單——
// 覆蓋 REFUNDED→COMPLETED、寫入 QR、推「可安裝」通知、再次發卡。
// 對應 CLAUDE.md 點名的「世界移動 callback 晚到覆蓋新狀態」「退款後仍可發卡」兩條禁忌。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/services/order', () => ({ markOrderCompleted: vi.fn() }))
vi.mock('@/lib/services/notification', () => ({
  notifyEsimReady: vi.fn(() => Promise.resolve()),
  notifyEsimPending: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn() }))
vi.mock('@/lib/services/tenant-config', () => ({ getEsimConfig: vi.fn() }))
vi.mock('@/lib/utils/crypto', () => ({ safeDecrypt: vi.fn((x: string) => x), encrypt: vi.fn((x: string) => x) }))

import { POST as esimOrdered } from '@/app/api/webhooks/wm/esim-ordered/route'
import { POST as esimRedeemed } from '@/app/api/webhooks/wm/esim-redeemed/route'
import { triggerEsimRedemption } from '@/lib/services/esim'
import { prisma } from '@/lib/db/prisma'
import { notifyEsimReady } from '@/lib/services/notification'

const req = (body: unknown) => ({ json: async () => body }) as Parameters<typeof esimOrdered>[0]

describe('eSIM 退款守門：退款後 callback / redeem 不可復活訂單', () => {
  beforeEach(() => vi.clearAllMocks())

  it('esim-ordered(2.2)：REFUNDED 訂單收到下單 callback → 回 1 但不 update（不覆蓋成 COMPLETED）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({ id: 'o1', esimRcode: null, status: 'REFUNDED' } as never)
    const res = await esimOrdered(req({ orderId: 'wm1', code: 0, itemList: [{ redemptionCode: 'R', iccid: 'I' }] }))
    expect(await res.text()).toBe('1')
    expect(prisma.order.update).not.toHaveBeenCalled()
  })

  it('esim-ordered(2.2)：正常 PAID 訂單 → 照常 update（守門不誤擋正常流程）', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({ id: 'o2', esimRcode: null, status: 'PAID' } as never)
    await esimOrdered(req({ orderId: 'wm2', code: 0, itemList: [{ redemptionCode: 'R', iccid: 'I' }] }))
    expect(prisma.order.update).toHaveBeenCalled()
  })

  it('esim-redeemed(3.2)：REFUNDED 訂單 → 不寫 QR、不推「可安裝」通知', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: 'o3', userId: 'u', esimQrcode: null, status: 'REFUNDED',
      orderItems: [{ productName: 'eSIM' }], user: { tenantAdminId: 't', groupMembership: null, ownedGroup: null },
    } as never)
    const res = await esimRedeemed(req({ rcode: 'R', resultcode: '000', qrcode: 'Q' }))
    expect(await res.text()).toBe('1')
    expect(prisma.order.update).not.toHaveBeenCalled()
    expect(notifyEsimReady).not.toHaveBeenCalled()
  })

  it('triggerEsimRedemption：REFUNDED 訂單按「我要安裝」→ ok:false，不觸發兌換', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: 'o4', status: 'REFUNDED', esimRcode: 'R', esimQrcode: null, redeemedAt: null, activatedAt: null,
      user: { tenantAdminId: 't', groupMembership: null, ownedGroup: null },
    } as never)
    const r = await triggerEsimRedemption('o4')
    expect(r.ok).toBe(false)
  })
})
