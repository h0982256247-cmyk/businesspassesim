import { prisma } from '@/lib/db/prisma'

// DB-backed 固定視窗限流（serverless 跨實例有效；不需 Redis）。
// fail-open：限流器自身出錯一律放行，絕不可因限流 bug 擋住正常付款/下單。
// 視窗起點併入 bucket key，舊 bucket 由 cleanupRateLimits()（每日 cron）清掉，
// 避免 rate_limits 無上限增長。
export async function checkRateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const windowStart = Math.floor(Date.now() / (windowSec * 1000)) * windowSec
    const bucket = `${key}:${windowStart}`
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO rate_limits (bucket, count, window_start)
      VALUES (${bucket}, 1, to_timestamp(${windowStart}))
      ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`
    return (rows[0]?.count ?? 0) <= limit
  } catch {
    return true // fail-open
  }
}

// 刪除已過期的限流視窗（每日 cron 呼叫）。回傳清掉的列數。
// fail-open：清理失敗只記錄、不丟例外，絕不可影響呼叫端 cron 的主要工作。
export async function cleanupRateLimits(): Promise<number> {
  try {
    // 任何視窗最長 1 天前的 bucket 都已無意義（目前最大視窗為分鐘級）。
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const n = await prisma.$executeRaw`DELETE FROM rate_limits WHERE window_start < ${cutoff}`
    return typeof n === 'number' ? n : 0
  } catch (e) {
    console.error('[rate-limit] cleanupRateLimits failed', e instanceof Error ? e.message : e)
    return 0
  }
}

// 取請求來源 IP（Vercel 走 x-forwarded-for）；取不到回 'unknown'
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return (xff ? xff.split(',')[0]?.trim() : '') || req.headers.get('x-real-ip') || 'unknown'
}
