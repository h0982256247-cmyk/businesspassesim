import { NextResponse } from 'next/server'
import { PLATFORM_COOKIE } from '@/lib/auth/platform'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PLATFORM_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
