import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'
import type { LineUserInfo } from '@/lib/auth/line'

export interface UpdateProfileInput {
  name: string
  phone: string
  email: string
  birthday: Date
}

export async function findOrCreateUser(lineInfo: LineUserInfo) {
  // 單一品牌：lineUid 全域唯一，直接以 lineUid 查。
  const existing = await prisma.user.findUnique({ where: { lineUid: lineInfo.sub } })

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: lineInfo.name,
        avatarUrl: lineInfo.picture ?? existing.avatarUrl,
      },
    })
    return { user: updated, isNewUser: false }
  }

  const user = await prisma.user.create({
    data: {
      lineUid: lineInfo.sub,
      displayName: lineInfo.name,
      avatarUrl: lineInfo.picture,
    },
  })

  return { user, isNewUser: true }
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      realName: input.name,
      // PII 加密（AES-256-GCM）。空字串保持空，避免讓 isProfileComplete 把空值誤判為已填。
      // 讀取端一律用 safeDecrypt（相容舊的明文資料，無需 backfill）。
      phone: input.phone ? encrypt(input.phone) : input.phone,
      email: input.email ? encrypt(input.email) : input.email,
      birthday: input.birthday,
    },
  })

  return updated
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      groupMembership: { include: { group: true } },
    },
  })
}

export function isProfileComplete(user: { realName?: string | null; phone: string | null; email: string | null; birthday: Date | null }) {
  return !!(user.realName && user.phone && user.email && user.birthday)
}

// 結帳/下單前的後端強制檢查：基本資料（姓名/手機/Email/生日）需填齊。
// phone/email 已加密但只看 truthiness，密文照樣 truthy，判斷不受影響。
export async function isUserProfileComplete(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { realName: true, phone: true, email: true, birthday: true },
  })
  return !!u && isProfileComplete(u)
}
