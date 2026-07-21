import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface SessionPayload extends JWTPayload {
  userId: string
  lineUid: string
}

function getSecret() {
  // 網站 session 簽章金鑰：與「LINE Login Channel Secret」是兩回事，用獨立的
  // SESSION_SECRET，不再 fallback 到 LINE_CHANNEL_SECRET（兩把金鑰解耦，
  // 之後輪替 LINE secret 不會連帶使全站 session 失效）。
  // ⚠ 部署前 Vercel 必須先設 SESSION_SECRET；值沿用原 LINE_CHANNEL_SECRET
  //   → 現有登入 session 不會失效（同一把金鑰、只是換獨立的 env 名）。
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
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
