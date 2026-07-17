import { NextRequest, NextResponse } from 'next/server'
import { cancelExpiredPendingOrders } from '@/lib/services/order'
import { cleanupRateLimits } from '@/lib/utils/rate-limit'
import { retryStuckEsimActivations } from '@/lib/services/esim'

// 重試也可能各打世界移動，拉到 60 秒避免逾時
export const maxDuration = 60

// GET /api/cron/cancel-pending-orders
// 每日由 Vercel Cron 呼叫（Hobby 方案 cron 上限為每日一次），取消超過 30 分鐘的
// PENDING 訂單；逾時即時取消另由付款流程 isOrderExpired 把關，此 cron 為後備清理。
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

  const cancelled = await cancelExpiredPendingOrders()
  // 順帶清掉過期限流視窗，避免 rate_limits 無上限增長（清理失敗不影響主工作）
  const rateLimitsPruned = await cleanupRateLimits()
  // 後備：自動重試卡住的開卡訂單。頻繁觸發走獨立的 /api/cron/retry-esim-activation；
  // 這裡每日掃一次當保底（即使外部高頻排程沒設，卡住的訂單仍會在 24h 內被補救）。
  const esimRetry = await retryStuckEsimActivations()
  return NextResponse.json({ ok: true, cancelled, rateLimitsPruned, esimRetry, at: new Date().toISOString() })
}
