import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export interface PlatformSessionPayload extends JWTPayload {
  adminId: string
  role: string
  tenantAdminId: string | null
  /** Set when a Super Admin has switched into a Platform Admin's view */
  impersonatorId?:   string | null
  impersonatorName?: string | null
}

export const PLATFORM_COOKIE = 'platform_session'

function getSecret() {
  const secret = process.env.PLATFORM_JWT_SECRET
  if (!secret) throw new Error('PLATFORM_JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function createPlatformSession(payload: PlatformSessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret())
}

export async function verifyPlatformSession(token: string): Promise<PlatformSessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as PlatformSessionPayload
}

// Server Component helper
export async function getPlatformSession(): Promise<PlatformSessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(PLATFORM_COOKIE)?.value
  if (!token) return null
  try {
    return await verifyPlatformSession(token)
  } catch {
    return null
  }
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
