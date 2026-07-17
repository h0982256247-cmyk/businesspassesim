import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'

export interface SaveCardInput {
  cardKey: string
  cardToken: string
  lastFour?: string | null
  cardType?: number | null
  funding?: number | null
  cardExpiresAt?: string | null
}

// 存/更新使用者的代扣卡片。card_key / card_token 一律加密；userId 唯一 → upsert。
// card_secret 只在 TapPay pay-by-prime 的「第一段回應」出現（backend_notify 沒有），
// 因此存卡要在扣款路由拿到 charge 回應時呼叫，而非 notify。
export async function upsertSavedCard(userId: string, input: SaveCardInput): Promise<void> {
  if (!input.cardKey || !input.cardToken) return

  const data = {
    cardKeyEnc: encrypt(input.cardKey),
    cardTokenEnc: encrypt(input.cardToken),
    lastFour: input.lastFour ?? '',
    cardType: input.cardType ?? 1,
    funding: input.funding ?? 0,
    cardExpiresAt: input.cardExpiresAt ?? null,
  }

  // 拆 find + update/create（適配 @prisma/adapter-pg；upsert 在並發下偶發問題）
  const existing = await prisma.savedCard.findUnique({ where: { userId } })
  if (existing) {
    await prisma.savedCard.update({ where: { userId }, data })
  } else {
    try {
      await prisma.savedCard.create({ data: { userId, ...data } })
    } catch {
      // 並發：另一請求已搶先建立（userId 唯一）→ 改為更新
      await prisma.savedCard.update({ where: { userId }, data })
    }
  }
}
