import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { createGift, cancelGift } from '@/lib/services/gift'

// POST /api/orders/[id]/gift  — sender 建立分享連結
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const r = await createGift(id, auth.userId)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 })

  return NextResponse.json({ ok: true, token: r.token, expiresAt: r.expiresAt.toISOString() })
}

// DELETE /api/orders/[id]/gift  — sender 取消分享
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const r = await cancelGift(id, auth.userId)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 })

  return NextResponse.json({ ok: true })
}
