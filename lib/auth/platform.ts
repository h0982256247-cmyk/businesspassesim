import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

export interface PlatformSessionPayload extends JWTPayload {
  adminId: string
  role: string // AdminRole: SUPER_ADMIN
}

export const PLATFORM_COOKIE = 'platform_session'

function getSecret() {
  const secret = process.env.PLATFORM_JWT_SECRET
  if (!secret) throw new Error('PLATFORM_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

// 後台 session 效期（秒）。呼叫端用同一個值同時設 JWT 與 cookie，兩者不可各自寫死——
// 曾發生 cookie 30 天但 JWT 寫死 8h，「記住我 30 天」實際 8h 就登出。
export const PLATFORM_SESSION_TTL = {
  default:  8 * 60 * 60,          // 未勾記住我：8 小時
  remember: 7 * 24 * 60 * 60,     // 勾記住我：7 天
} as const

// ttlSec 同時決定 JWT 到期與（由呼叫端）cookie maxAge，避免兩者漂移。
export async function createPlatformSession(payload: PlatformSessionPayload, ttlSec: number): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttlSec)
    .sign(getSecret())
}

export async function verifyPlatformSession(token: string): Promise<PlatformSessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as PlatformSessionPayload
}

// Route handler guard — returns null if authorized, or a 401 Response
export async function requirePlatformAuth(req: NextRequest): Promise<PlatformSessionPayload | NextResponse> {
  const token = req.cookies.get(PLATFORM_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return await verifyPlatformSession(token)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}
