import { describe, it, expect, vi, beforeEach } from 'vitest'

// F-9：/api/webhooks/wm/esim-activated（世界移動 2.7 激活通知）同樣是公開無簽章端點。
// 它寫的是 activatedAt / activationStart / activationEnd——activatedAt 一旦寫入就不可轉贈，
// activationEnd 決定前台顯示的到期日與 deriveEsimStatus 的「使用中／已到期」。
//
// 舊寫法先 SELECT 判斷（冪等、退款守門）再 update by id，中間隔著判斷邏輯：
// 讀到寫之間訂單仍可能被退款／取消，或另一則重播的 callback 先寫進去。
// 改成條件式 updateMany，把守門條件放進 where，與 P0-6 其他寫入一致。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findFirst: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) } },
}))

import { POST as esimActivated } from '@/app/api/webhooks/wm/esim-activated/route'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus } from '@prisma/client'

const req = (body: unknown) => ({ json: async () => body }) as Parameters<typeof esimActivated>[0]

const orderRow = (o: Record<string, unknown> = {}) => ({
  id: 'o1', userId: 'u1', activatedAt: null, status: 'COMPLETED', ...o,
})

const body = (o: Record<string, unknown> = {}) => ({
  orderId: 'WM-1', rcode: 'RC-REAL',
  useSDate: '1767225600000', useEDate: '1767484800000',
  ...o,
})

const writeCall = () =>
  vi.mocked(prisma.order.updateMany).mock.calls[0]?.[0] as
    | { where: Record<string, unknown>; data: Record<string, unknown> }
    | undefined

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 } as never)
})

describe('WM 2.7 激活通知 — 寫入必須是條件式', () => {
  it('正常激活 → 寫入 activatedAt 與起訖時間', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    const res = await esimActivated(req(body()))

    expect(await res.text()).toBe('1')
    expect(writeCall()?.data).toMatchObject({
      activatedAt: expect.any(Date),
      activationStart: expect.any(Date),
      activationEnd: expect.any(Date),
    })
  })

  it('where 必須帶 activatedAt: null 與非終態，讀到寫之間的變更才擋得住', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    await esimActivated(req(body()))

    expect(writeCall()?.where).toMatchObject({
      id: 'o1',
      activatedAt: null,
      status: { notIn: [OrderStatus.REFUNDED, OrderStatus.CANCELLED] },
    })
  })

  it('orderId + rcode 對不到訂單（偽造）→ 完全不寫入', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null as never)

    const res = await esimActivated(req(body({ rcode: 'RC-FAKE' })))

    expect(await res.text()).toBe('1')
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('已激活過 → 冪等早退，不覆蓋首次時間戳', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(
      orderRow({ activatedAt: new Date('2026-01-01') }) as never,
    )

    const res = await esimActivated(req(body()))

    expect(await res.text()).toBe('1')
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('已退款訂單 → 不寫激活時間', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow({ status: 'REFUNDED' }) as never)

    const res = await esimActivated(req(body()))

    expect(await res.text()).toBe('1')
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })

  it('時間戳無法解析 → 只寫 activatedAt，不寫入 Invalid Date', async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue(orderRow() as never)

    await esimActivated(req(body({ useSDate: 'not-a-number', useEDate: undefined })))

    expect(writeCall()?.data).toEqual({ activatedAt: expect.any(Date) })
  })
})
