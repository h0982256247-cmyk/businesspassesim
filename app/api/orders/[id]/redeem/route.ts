import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { triggerEsimRedemption } from '@/lib/services/esim'
import { getOrderForOwner } from '@/lib/services/order'

// POST /api/orders/[id]/redeem
// 用戶按下「我要安裝」時呼叫。觸發 WM 3.1 兌換，3.2 callback 之後 QR/LPA 才會出現在訂單上。
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  // fail-closed：owner 條件進 where，非擁有者查不到 → 統一 404（不洩漏訂單存在性）。
  const order = await getOrderForOwner(id, auth.userId, { id: true })
  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })

  const r = await triggerEsimRedemption(id)
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: 422 })

  return NextResponse.json({ ok: true })
}
