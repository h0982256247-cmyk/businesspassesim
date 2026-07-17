import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface SessionPayload extends JWTPayload {
  userId: string
  lineUid: string
  // 使用者所屬租戶。註冊後幾乎不會變動（findOrCreateUser 只在尚未設定時寫入），
  // 故可安全嵌入 JWT，省掉 /api 每次的 prisma.user.findUnique 查租戶 round-trip。
  // 舊版 token 沒有此欄位 → API 端 fallback 回 DB 查。
  tenantAdminId?: string | null
}

function getSecret() {
  // 網站 session 簽章金鑰：與「LINE Login Channel Secret」是兩回事，故用獨立的
  // SESSION_SECRET。為相容既有部署，未設定 SESSION_SECRET 時退回舊的
  // LINE_CHANNEL_SECRET（沿用同一把金鑰 → 現有登入 session 不會失效）。
  // 待 Vercel 設好 SESSION_SECRET（值沿用原 LINE_CHANNEL_SECRET）後即可移除 fallback。
  const secret = process.env.SESSION_SECRET ?? process.env.LINE_CHANNEL_SECRET
  if (!secret) throw new Error('SESSION_SECRET (or legacy LINE_CHANNEL_SECRET) is not set')
  return new TextEncoder().encode(secret)
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as SessionPayload
}

export const SESSION_COOKIE = 'esim_session'
