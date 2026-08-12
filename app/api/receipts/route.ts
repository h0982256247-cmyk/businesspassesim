import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { issueOrGetReceipt } from '@/lib/services/receipt'

// POST /api/receipts — 開立/取回訂單收據（一訂單一收據，冪等）
// Body: { orderId, buyerName?, taxId?, buyerAddress? }（三欄選填，有填即鎖）
export async function POST(req: NextRequest) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const orderId = typeof body.orderId === 'string' ? body.orderId : ''
  if (!orderId) return NextResponse.json({ error: 'orderId 必填' }, { status: 400 })

  const receipt = await issueOrGetReceipt(auth.userId, orderId, {
    buyerName: body.buyerName,
    taxId: body.taxId,
    buyerAddress: body.buyerAddress,
  })
  if (!receipt) return NextResponse.json({ error: '訂單不存在或不可開立收據' }, { status: 404 })
  return NextResponse.json({ receipt })
}
