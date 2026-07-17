import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { queryEsimUsage } from '@/lib/services/esim'
import { getOrderForOwner } from '@/lib/services/order'

// GET /api/orders/:id/usage — 查詢 eSIM 剩餘流量（即時向世界移動查詢）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  // fail-closed + 統一 currentOwnerId（與 redeem 一致）：轉贈後由現任擁有者查流量。
  const order = await getOrderForOwner(id, auth.userId, {
    esimIccid: true,
    status: true,
    user: { select: { tenantAdminId: true } },
  })

  if (!order) return NextResponse.json({ error: '訂單不存在' }, { status: 404 })
  if (order.status !== 'COMPLETED') return NextResponse.json({ error: 'eSIM 尚未啟動' }, { status: 400 })
  if (!order.esimIccid) return NextResponse.json({ error: '無 ICCID 資料' }, { status: 400 })

  const usage = await queryEsimUsage(order.esimIccid, order.user?.tenantAdminId ?? null)

  if (!usage) return NextResponse.json({ error: '無法取得用量資料' }, { status: 502 })

  return NextResponse.json({ usage })
}
