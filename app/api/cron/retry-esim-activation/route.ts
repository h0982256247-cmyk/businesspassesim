import { NextRequest, NextResponse } from 'next/server'
import { retryStuckEsimActivations } from '@/lib/services/esim'

// 一次最多重試 20 筆、每筆各打世界移動，拉到 60 秒避免逾時（比照 bundle/匯入）
export const maxDuration = 60

// GET /api/cron/retry-esim-activation
// 自動重試「付款成功但尚未發卡」的 eSIM 訂單（退避 + 上限，超過上限改人工告警）。
// 卡住即時補救另有後台手動重發鈕把關，此 cron 為自動後備。
// 驗證方式：Vercel 自動帶 Authorization: Bearer {CRON_SECRET}
export async function GET(req: NextRequest) {
  // Fail-closed：未設定 CRON_SECRET 一律拒絕（先前未設定時端點完全公開，任何人可觸發）
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET 未設定，拒絕執行' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await retryStuckEsimActivations()
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() })
}
