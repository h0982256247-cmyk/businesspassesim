import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { listReceiptableOrders } from '@/lib/services/receipt'

// GET /api/receipts/orders — 可開立收據的訂單清單（付款已收；含既有收據資訊）
export async function GET(req: NextRequest) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const orders = await listReceiptableOrders(auth.userId)
  return NextResponse.json({ orders })
}
