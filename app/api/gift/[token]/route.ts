import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getTransferByToken } from '@/lib/services/transfer'

// GET /api/gift/:token — 好友開領取頁時查轉贈概要（需登入，不回傳敏感 QR/rcode）
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { token } = await params
  const t = await getTransferByToken(token)
  if (!t) return NextResponse.json({ error: '轉贈連結無效' }, { status: 404 })
  return NextResponse.json({
    fromName: t.fromName,
    productName: t.productName,
    dataCapacity: t.dataCapacity,
    state: t.state,               // claimable / claimed / cancelled / expired / unavailable
    isMine: t.fromUserId === auth.userId,   // 自己送出的轉贈
    claimedByMe: t.toUserId === auth.userId, // 我已領取過
  })
}
