import { describe, it, expect, vi, beforeEach } from 'vitest'

// 換 Partner Key（等同換 TapPay 帳號）時，一次清除該租戶所有記憶卡：
// 舊 partner 綁的 card token 在新 partner 無法代扣，不清會導致記憶卡付款失敗。
// 僅信用卡 gateway 觸發；LINE Pay 無記憶卡；partner key 沿用（未變）或首次建立都不清。
const { tx } = vi.hoisted(() => ({
  tx: {
    savedCard: { deleteMany: vi.fn() },
    tenantPaymentConfig: { update: vi.fn() },
  },
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tenantPaymentConfig: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  },
}))
vi.mock('@/lib/utils/crypto', () => ({
  encrypt: vi.fn((x: string) => `enc(${x})`),
  safeDecrypt: vi.fn((x: string) => x), // identity：existing.partnerKey 直接當明文比對
}))

import { upsertPaymentConfig } from '@/lib/services/tenant-config'
import { prisma } from '@/lib/db/prisma'

const input = (partnerKey: string, gateway = 'tappay_credit') => ({
  gateway, partnerKey, merchantId: 'MID', env: 'production',
})

describe('upsertPaymentConfig — 換 Partner Key 時清除舊綁卡', () => {
  beforeEach(() => vi.clearAllMocks())

  it('partner key 變更（tappay_credit）→ 清除該租戶所有記憶卡', async () => {
    vi.mocked(prisma.tenantPaymentConfig.findUnique).mockResolvedValue({ partnerKey: 'OLD_PK', merchantId: 'MID' } as never)
    await upsertPaymentConfig('admin1', input('NEW_PK'))
    expect(tx.savedCard.deleteMany).toHaveBeenCalledWith({ where: { user: { tenantAdminId: 'admin1' } } })
  })

  it('partner key 沿用未變 → 不清卡', async () => {
    vi.mocked(prisma.tenantPaymentConfig.findUnique).mockResolvedValue({ partnerKey: 'SAME_PK', merchantId: 'MID' } as never)
    await upsertPaymentConfig('admin1', input('SAME_PK'))
    expect(tx.savedCard.deleteMany).not.toHaveBeenCalled()
  })

  it('只有 merchant ID 變、partner key 沒變 → 不清卡（改以 partner key 為準）', async () => {
    vi.mocked(prisma.tenantPaymentConfig.findUnique).mockResolvedValue({ partnerKey: 'SAME_PK', merchantId: 'OLD_MID' } as never)
    await upsertPaymentConfig('admin1', { ...input('SAME_PK'), merchantId: 'NEW_MID' })
    expect(tx.savedCard.deleteMany).not.toHaveBeenCalled()
  })

  it('LINE Pay gateway 換 partner key → 不清（只在信用卡 gateway 判斷）', async () => {
    vi.mocked(prisma.tenantPaymentConfig.findUnique).mockResolvedValue({ partnerKey: 'OLD_PK', merchantId: 'MID' } as never)
    await upsertPaymentConfig('admin1', input('NEW_PK', 'tappay_linepay'))
    expect(tx.savedCard.deleteMany).not.toHaveBeenCalled()
  })

  it('首次建立（無舊設定）→ 不清卡', async () => {
    vi.mocked(prisma.tenantPaymentConfig.findUnique).mockResolvedValue(null as never)
    await upsertPaymentConfig('admin1', input('PK'))
    expect(tx.savedCard.deleteMany).not.toHaveBeenCalled()
    expect(prisma.tenantPaymentConfig.create).toHaveBeenCalled()
  })
})
