import { prisma } from '@/lib/db/prisma'
import type { Prisma } from '@prisma/client'

// 系統告警：把「業務關鍵 async 失敗」（開卡失敗、金流驗真失敗、WM 下單失敗）
// 寫進可查的 system_alerts，並在平台後台儀表板紅色警示區呈現。取代過去的
// `.catch(()=>{})` 靜默吞錯與一次性診斷表。
// 絕不可影響主流程：自身失敗只退回 console，不丟例外。
export interface AlertContext {
  orderId?: string | null
  level?: 'error' | 'warn'
  [k: string]: unknown
}

export async function recordAlert(label: string, ctx: AlertContext = {}): Promise<void> {
  try {
    const { orderId = null, level = 'error', ...rest } = ctx
    await prisma.systemAlert.create({
      data: { level, label, orderId, context: rest as Prisma.InputJsonValue },
    })
  } catch (e) {
    // 告警本身不可影響主流程
    console.error('[alert] recordAlert failed', label, e instanceof Error ? e.message : e)
  }
}
