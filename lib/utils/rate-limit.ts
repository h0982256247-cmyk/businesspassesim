import { prisma } from '@/lib/db/prisma'

// DB-backed 固定視窗限流（serverless 跨實例有效；不需 Redis）。
// 視窗起點併入 bucket key，舊 bucket 由 cleanupRateLimits()（每日 cron）清掉，
// 避免 rate_limits 無上限增長。
//
// ⚠ 一律 fail-open，且失敗必須留下 log —— 這條規則是踩過才寫下的：
//   曾為了讓後台登入「DB 掛掉時也要有防護」而加 failClosed 選項，但當時 rate_limits
//   表根本不存在（schema 從未定義），INSERT 每次都丟例外 → fail-closed 一律回擋
//   → 後台永遠 429，管理員被自己的限流鎖在門外，且因為 catch 是空的、log 也沒有，
//   完全查不出原因。
//   結論：限流器壞掉時「擋下全部人」的自我 DoS，比「暫時失去防爆破」更嚴重——
//   密碼仍需正確（bcrypt 12 rounds + 12 碼英數政策）。所以壞掉時放行，但要吵，
//   讓它可被發現、可修，而不是安靜地把人鎖在外面。
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
  } catch (e) {
    // 不可靜默吞錯（CLAUDE.md F）：限流器壞掉＝防護消失，必須看得到。
    // key 只印前綴（admin-login:ip / pay 等），不印 IP／帳號等識別資料。
    console.error('[rate-limit] 限流器失效，本次放行', {
      scope: key.split(':')[0],
      error: e instanceof Error ? e.message : String(e),
    })
    return true
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
