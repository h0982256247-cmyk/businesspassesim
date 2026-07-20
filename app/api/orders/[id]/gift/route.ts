import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { createTransfer, cancelTransfer } from '@/lib/services/transfer'

// POST /api/orders/:id/gift — 目前擁有者建立轉贈連結（回傳 token）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const r = await createTransfer(id, auth.userId)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 })
  return NextResponse.json({ ok: true, token: r.token })
}

// DELETE /api/orders/:id/gift — 取消轉贈（未被領取時）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const r = await cancelTransfer(id, auth.userId)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 })
  return NextResponse.json({ ok: true })
}
