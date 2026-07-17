import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { settleCommissions } from '@/lib/services/commission'
import { GroupStatus } from '@prisma/client'

// GET /api/cron/settle-monthly
// 每月 1 號由 Vercel Cron 呼叫，對所有 APPROVED 社群結算「上個月」
// 驗證方式：Vercel 自動帶 Authorization: Bearer {CRON_SECRET}
export async function GET(req: NextRequest) {
  // Fail-closed：未設定 CRON_SECRET 一律拒絕。此端點會觸發全社群月結（動到金流），
  // 先前未設定時完全公開，任何人都能呼叫提前 / 重複觸發結算。
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET 未設定，拒絕執行' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 結算「上個月」（this 月 1 號跑時，結算上月）
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const period = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`

  const groups = await prisma.group.findMany({
    where: { status: GroupStatus.APPROVED },
    select: { id: true, name: true },
  })

  let settled = 0
  const errors: { groupName: string; error: string }[] = []

  for (const g of groups) {
    try {
      await settleCommissions(g.id, period)
      settled++
    } catch (err) {
      errors.push({ groupName: g.name, error: err instanceof Error ? err.message : 'unknown' })
    }
  }

  // 每月把活動券「剩餘次數」重設為各社群的上限（過去只減不回復 → 發完永久卡住）。
  // 跟月結同一支 cron（每月 1 號）跑，時點正確。
  let quotaReset = 0
  try {
    quotaReset = await prisma.$executeRaw`
      UPDATE groups
      SET activity_coupon_quota = monthly_coupon_quota, quota_reset_at = now()
      WHERE status = 'APPROVED'`
  } catch (err) {
    errors.push({ groupName: '(quota reset)', error: err instanceof Error ? err.message : 'unknown' })
  }

  return NextResponse.json({
    ok: true,
    period,
    totalGroups: groups.length,
    settled,
    quotaReset,
    errors,
    at: new Date().toISOString(),
  })
}
