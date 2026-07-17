import { recordAlert } from '@/lib/services/alert'

// business-critical 的 fire-and-forget async（付款後開卡 / 分潤 / 發券）失敗不可
// 靜默吞錯（CLAUDE.md 守則 F）。過去用 `.catch(()=>{})`，導致「付款成功卻沒收到
// eSIM」這類問題完全沒有任何痕跡、極難 debug。現在除了印 log（Vercel 可見），也寫進
// system_alerts → 平台後台儀表板會跳紅色警示。仍不阻塞主流程（webhook 照回 200）。
// ctx 慣例：呼叫端多半傳 orderId 字串，藉此把告警關聯到訂單。
export function fireAndLog(label: string, ctx: unknown, p: Promise<unknown>): void {
  p.catch(e => {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[fire-and-log] ${label} failed`, ctx, msg)
    recordAlert(label, { orderId: typeof ctx === 'string' ? ctx : null, error: msg })
  })
}
