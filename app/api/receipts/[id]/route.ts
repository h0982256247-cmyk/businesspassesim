import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getReceiptForUser, updateReceiptFields } from '@/lib/services/receipt'

// GET /api/receipts/:id — 取回本人收據
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const receipt = await getReceiptForUser(auth.userId, id)
  if (!receipt) return NextResponse.json({ error: '收據不存在' }, { status: 404 })
  return NextResponse.json({ receipt })
}

// PATCH /api/receipts/:id — 補填抬頭/統編/地址（已填即鎖，鎖後不可改）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const result = await updateReceiptFields(auth.userId, id, {
    buyerName: body.buyerName,
    taxId: body.taxId,
    buyerAddress: body.buyerAddress,
  })
  if (result === 'notfound') return NextResponse.json({ error: '收據不存在' }, { status: 404 })
  if (result === 'locked') return NextResponse.json({ error: '此收據已填寫抬頭資料，無法再修改' }, { status: 409 })
  return NextResponse.json({ receipt: result })
}
