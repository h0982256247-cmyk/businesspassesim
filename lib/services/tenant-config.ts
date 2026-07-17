import { prisma } from '@/lib/db/prisma'
import { encrypt, safeDecrypt } from '@/lib/utils/crypto'

// ─── eSIM 供應商設定 ──────────────────────────────────────────────

/** Returns config with decrypted token (for internal server use only) */
export async function getEsimConfig(adminId: string) {
  const cfg = await prisma.tenantEsimConfig.findUnique({ where: { adminId } })
  if (!cfg) return null
  return { ...cfg, token: safeDecrypt(cfg.token) }
}

export async function upsertEsimConfig(
  adminId: string,
  input: {
    provider?: string
    apiUrl: string
    merchantId: string
    deptId: string
    token: string
  },
) {
  const encryptedToken = encrypt(input.token)
  // 拆 upsert：適配 @prisma/adapter-pg 回傳異常
  const existing = await prisma.tenantEsimConfig.findUnique({ where: { adminId } })
  if (existing) {
    return prisma.tenantEsimConfig.update({
      where: { adminId },
      data: {
        provider: input.provider,
        apiUrl: input.apiUrl,
        merchantId: input.merchantId,
        deptId: input.deptId,
        token: encryptedToken,
        isActive: true,
      },
    })
  }
  return prisma.tenantEsimConfig.create({
    data: {
      adminId,
      provider: input.provider ?? 'worldmove',
      apiUrl: input.apiUrl,
      merchantId: input.merchantId,
      deptId: input.deptId,
      token: encryptedToken,
    },
  })
}

// ─── 金流設定 ─────────────────────────────────────────────────────

/** Returns configs with decrypted keys (for internal server use only) */
export async function getPaymentConfigs(adminId: string) {
  const cfgs = await prisma.tenantPaymentConfig.findMany({ where: { adminId } })
  return cfgs.map(c => ({
    ...c,
    partnerKey: safeDecrypt(c.partnerKey),
    appKey: c.appKey ? safeDecrypt(c.appKey) : c.appKey,
  }))
}

/** Returns single config with decrypted keys (for internal server use only) */
export async function getPaymentConfig(adminId: string, gateway: string) {
  const c = await prisma.tenantPaymentConfig.findFirst({ where: { adminId, gateway } })
  if (!c) return null
  return {
    ...c,
    partnerKey: safeDecrypt(c.partnerKey),
    appKey: c.appKey ? safeDecrypt(c.appKey) : c.appKey,
  }
}

export async function upsertPaymentConfig(
  adminId: string,
  input: {
    gateway: string
    partnerKey: string
    merchantId: string
    env: string
    appId?: string
    appKey?: string
  },
) {
  const encryptedPartnerKey = encrypt(input.partnerKey)
  const encryptedAppKey = input.appKey ? encrypt(input.appKey) : undefined

  // 拆 upsert：適配 @prisma/adapter-pg
  const existing = await prisma.tenantPaymentConfig.findUnique({
    where: { adminId_gateway: { adminId, gateway: input.gateway } },
  })
  if (existing) {
    // 換 Partner Key（等同換 TapPay 帳號）：舊 partner 綁的記憶卡（card token）在新 partner
    // 無法代扣，一次清除該租戶所有綁卡，使用者下次付款會重新綁定。僅信用卡 gateway 觸發
    // （LINE Pay 無記憶卡）。partner key 以「遮罩沿用現有」傳入時，解密後相等 → 不誤清。
    // 清卡與更新設定包成同一 transaction，避免只成一半。
    const partnerKeyChanged =
      input.gateway === 'tappay_credit' && safeDecrypt(existing.partnerKey) !== input.partnerKey
    return prisma.$transaction(async tx => {
      if (partnerKeyChanged) {
        await tx.savedCard.deleteMany({ where: { user: { tenantAdminId: adminId } } })
      }
      return tx.tenantPaymentConfig.update({
        where: { adminId_gateway: { adminId, gateway: input.gateway } },
        data: {
          partnerKey: encryptedPartnerKey,
          merchantId: input.merchantId,
          env: input.env,
          appId: input.appId,
          appKey: encryptedAppKey,
          // 不在此強制 isActive=true：前台顯示與否由獨立的啟用開關控制，
          // 重存金鑰/Merchant ID 不應意外把被關閉的支付方式重新打開。
        },
      })
    })
  }
  return prisma.tenantPaymentConfig.create({
    data: {
      adminId,
      gateway: input.gateway,
      partnerKey: encryptedPartnerKey,
      merchantId: input.merchantId,
      env: input.env,
      appId: input.appId,
      appKey: encryptedAppKey,
    },
  })
}

/** 切換某金流前台啟用狀態（前端是否顯示此支付）。只動 isActive，不碰金鑰。 */
export async function setPaymentConfigActive(adminId: string, gateway: string, isActive: boolean) {
  return prisma.tenantPaymentConfig.update({
    where: { adminId_gateway: { adminId, gateway } },
    data: { isActive },
  })
}

// ─── 工具 ─────────────────────────────────────────────────────────

export function maskSecret(s: string): string {
  if (s.length <= 4) return '****'
  return '****' + s.slice(-4)
}
