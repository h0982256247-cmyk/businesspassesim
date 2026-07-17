import { NextRequest, NextResponse } from 'next/server'
import { cancelExpiredGifts } from '@/lib/services/gift'

// GET /api/cron/cancel-expired-gifts
// 每日由 Vercel Cron 呼叫，自動取消過期未領取的 OrderGift
export async function GET(req: NextRequest) {
  // Fail-closed：未設定 CRON_SECRET 一律拒絕（先前未設定時端點完全公開，任何人可觸發）
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET 未設定，拒絕執行' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cancelled = await cancelExpiredGifts()
  return NextResponse.json({ ok: true, cancelled, at: new Date().toISOString() })
}
