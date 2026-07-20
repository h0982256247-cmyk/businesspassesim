import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { claimTransfer } from '@/lib/services/transfer'

// POST /api/gift/:token/claim — 好友領取轉贈（原子鎖 + 擁有權轉移）
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { token } = await params
  const r = await claimTransfer(token, auth.userId)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 })
  return NextResponse.json({ ok: true })
}
