import { prisma } from '@/lib/db/prisma'
import { issueCoupon } from '@/lib/services/coupon'
import { encrypt } from '@/lib/utils/crypto'
import type { LineUserInfo } from '@/lib/auth/line'

export interface UpdateProfileInput {
  name: string
  phone: string
  email: string
  birthday: Date
}

export async function findOrCreateUser(lineInfo: LineUserInfo, tenantAdminId?: string) {
  // 多租戶：同一 lineUid 在不同白牌＝不同 User，查詢必須帶租戶範圍。
  let existing = await prisma.user.findFirst({
    where: { lineUid: lineInfo.sub, ...(tenantAdminId ? { tenantAdminId } : {}) },
  })
  // 相容遷移：舊資料可能 tenantAdminId 為 null，首次帶租戶登入時認領它（補上租戶），
  // 不另開新列。下方 update 會把 tenantAdminId 寫進去。
  if (!existing && tenantAdminId) {
    existing = await prisma.user.findFirst({
      where: { lineUid: lineInfo.sub, tenantAdminId: null },
    })
  }

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: lineInfo.name,
        avatarUrl: lineInfo.picture ?? existing.avatarUrl,
        // 只在尚未設定租戶時才寫入（防止跨租戶登入覆蓋）
        ...(tenantAdminId && !existing.tenantAdminId ? { tenantAdminId } : {}),
      },
    })
    return { user: updated, isNewUser: false }
  }

  const user = await prisma.user.create({
    data: {
      lineUid: lineInfo.sub,
      displayName: lineInfo.name,
      avatarUrl: lineInfo.picture,
      tenantAdminId: tenantAdminId ?? null,
    },
  })

  return { user, isNewUser: true }
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  const isFirstUpdate = !user.phone && !user.email

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

  // 首次填寫個資 → 發放官方歡迎券（C 級 9 折）
  if (isFirstUpdate) {
    await issueCoupon({
      ownerId: userId,
      ownerUid: updated.lineUid,
      type: 'OFFICIAL_WELCOME',
      discount: 0.9,
      isOfficial: true,
    })
  }

  return updated
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      groupMembership: { include: { group: true } },
      ownedGroup: true,
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
