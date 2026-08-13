import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getReceiptForUser } from '@/lib/services/receipt'

// GET /api/receipts/:id — 取回本人收據（開立後鎖定，無修改端點）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const receipt = await getReceiptForUser(auth.userId, id)
  if (!receipt) return NextResponse.json({ error: '收據不存在' }, { status: 404 })
  return NextResponse.json({ receipt })
}
