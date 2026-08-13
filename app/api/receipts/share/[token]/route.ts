import { NextRequest, NextResponse } from 'next/server'
import { getReceiptByShareToken, RECEIPT_SELLER } from '@/lib/services/receipt'

// GET /api/receipts/share/:token — 公開取收據（免登入，靠不可猜的 shareToken）；供分享頁渲染
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const receipt = await getReceiptByShareToken(token)
  if (!receipt) return NextResponse.json({ error: '收據不存在' }, { status: 404 })
  return NextResponse.json({ receipt, seller: RECEIPT_SELLER })
}
