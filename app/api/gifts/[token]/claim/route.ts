import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { claimGift } from '@/lib/services/gift'

// POST /api/gifts/[token]/claim  — recipient 領取（需完整註冊）
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await req.cookies.get(SESSION_COOKIE)?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized', needsLogin: true }, { status: 401 })

  let auth
  try { auth = await verifySession(session) } catch {
    return NextResponse.json({ error: 'Invalid session', needsLogin: true }, { status: 401 })
  }

  const { token } = await params
  const r = await claimGift(token, auth.userId)
  if (!r.ok) {
    return NextResponse.json(
      { error: r.reason, needsRegistration: r.needsRegistration ?? false },
      { status: 422 },
    )
  }

  return NextResponse.json({ ok: true, orderId: r.orderId })
}
