import { prisma } from '@/lib/db/prisma'
import { encrypt, safeDecrypt } from '@/lib/utils/crypto'

// 單一品牌全域整合設定（世界移動 eSIM / TapPay 金流）。
// 原白標版是 per-tenant（by adminId），改單品牌後收斂為 singleton 設定表：
// EsimConfig 固定單列（id="singleton"）、PaymentConfig 以 gateway 唯一。

// ─── eSIM 供應商設定 ──────────────────────────────────────────────

const ESIM_CONFIG_ID = 'singleton'

/** Returns config with decrypted token (for internal server use only) */
export async function getEsimConfig() {
  const cfg = await prisma.esimConfig.findUnique({ where: { id: ESIM_CONFIG_ID } })
  if (!cfg) return null
  return { ...cfg, token: safeDecrypt(cfg.token) }
}

export async function upsertEsimConfig(
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
  const existing = await prisma.esimConfig.findUnique({ where: { id: ESIM_CONFIG_ID } })
  if (existing) {
    return prisma.esimConfig.update({
      where: { id: ESIM_CONFIG_ID },
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
  return prisma.esimConfig.create({
    data: {
      id: ESIM_CONFIG_ID,
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
export async function getPaymentConfigs() {
  const cfgs = await prisma.paymentConfig.findMany()
  return cfgs.map(c => ({
    ...c,
    partnerKey: safeDecrypt(c.partnerKey),
    appKey: c.appKey ? safeDecrypt(c.appKey) : c.appKey,
  }))
}

/** Returns single config with decrypted keys (for internal server use only) */
export async function getPaymentConfig(gateway: string) {
  const c = await prisma.paymentConfig.findUnique({ where: { gateway } })
  if (!c) return null
  return {
    ...c,
    partnerKey: safeDecrypt(c.partnerKey),
    appKey: c.appKey ? safeDecrypt(c.appKey) : c.appKey,
  }
}

export async function upsertPaymentConfig(
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
  const existing = await prisma.paymentConfig.findUnique({ where: { gateway: input.gateway } })
  if (existing) {
    // 換 Partner Key（等同換 TapPay 帳號）：舊 partner 綁的記憶卡（card token）在新 partner
    // 無法代扣，一次清除所有綁卡，使用者下次付款會重新綁定。僅信用卡 gateway 觸發
    // （LINE Pay 無記憶卡）。partner key 以「遮罩沿用現有」傳入時，解密後相等 → 不誤清。
    // 清卡與更新設定包成同一 transaction，避免只成一半。
    const partnerKeyChanged =
      input.gateway === 'tappay_credit' && safeDecrypt(existing.partnerKey) !== input.partnerKey
    return prisma.$transaction(async tx => {
      if (partnerKeyChanged) {
        await tx.savedCard.deleteMany({})
      }
      return tx.paymentConfig.update({
        where: { gateway: input.gateway },
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
  return prisma.paymentConfig.create({
    data: {
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
export async function setPaymentConfigActive(gateway: string, isActive: boolean) {
  return prisma.paymentConfig.update({
    where: { gateway },
    data: { isActive },
  })
}

// ─── 全域設定（品牌 / 網域 / 福利價倍率）────────────────────────────

const SETTING_ID = 'singleton'

/** 回傳全域設定（lineChannelToken 已解密，僅供 server 用）。未設定的品牌欄位為 null，
 *  呼叫端（tenant.ts / notification.ts）再以 env 補 fallback。 */
export async function getPlatformSettings() {
  const s = await prisma.platformSetting.findUnique({ where: { id: SETTING_ID } })
  return {
    benefitMarkupRate: s ? Number(s.benefitMarkupRate) : 1.5,
    brandName: s?.brandName ?? null,
    logoUrl: s?.logoUrl ?? null,
    primaryColor: s?.primaryColor ?? null,
    lineOaUrl: s?.lineOaUrl ?? null,
    liffId: s?.liffId ?? null,
    lineChannelToken: s?.lineChannelToken ? safeDecrypt(s.lineChannelToken) : null,
    domain: s?.domain ?? null,
    transferEnabled: s?.transferEnabled ?? false,
  }
}

export interface UpdatePlatformSettingsInput {
  benefitMarkupRate?: number
  brandName?: string | null
  logoUrl?: string | null
  primaryColor?: string | null
  lineOaUrl?: string | null
  liffId?: string | null
  lineChannelToken?: string | null  // 明文；傳入遮罩值（****開頭）代表沿用、不覆寫
  domain?: string | null
  transferEnabled?: boolean
}

export async function updatePlatformSettings(input: UpdatePlatformSettingsInput) {
  const data: Record<string, unknown> = {}
  if (input.benefitMarkupRate !== undefined) data.benefitMarkupRate = input.benefitMarkupRate
  if (input.brandName !== undefined) data.brandName = input.brandName
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl
  if (input.primaryColor !== undefined) data.primaryColor = input.primaryColor
  if (input.lineOaUrl !== undefined) data.lineOaUrl = input.lineOaUrl
  if (input.liffId !== undefined) data.liffId = input.liffId
  if (input.domain !== undefined) data.domain = input.domain?.toLowerCase().split(':')[0].trim() || null
  if (input.transferEnabled !== undefined) data.transferEnabled = input.transferEnabled
  if (input.lineChannelToken !== undefined) {
    // 遮罩值沿用（不覆寫既有加密 token）；空字串清除；其餘加密後寫入
    if (!(input.lineChannelToken && input.lineChannelToken.startsWith('****'))) {
      data.lineChannelToken = input.lineChannelToken ? encrypt(input.lineChannelToken) : null
    }
  }

  const existing = await prisma.platformSetting.findUnique({ where: { id: SETTING_ID } })
  if (existing) return prisma.platformSetting.update({ where: { id: SETTING_ID }, data })
  return prisma.platformSetting.create({ data: { id: SETTING_ID, ...data } })
}

// ─── 工具 ─────────────────────────────────────────────────────────

export function maskSecret(s: string): string {
  if (s.length <= 4) return '****'
  return '****' + s.slice(-4)
}
