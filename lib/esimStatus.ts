// ─────────────────────────────────────────────────────────────────
// eSIM 狀態：單一來源
//
// 後端有 8 個 OrderStatus（PENDING/PROCESSING/PAID/COMPLETED/…），但那是
// 「金流＋供應商」視角；使用者根本不在乎「COMPLETED」是什麼。這支模組把
// 後端狀態 + esim 欄位（rcode/qrcode/redeemedAt/activatedAt/到期日）收斂成
// 「使用者視角」的 phase，並提供統一的文案、配色、分頁分組與剩餘天數。
//
// 列表頁與詳情頁都從這裡取字，避免同一張卡在兩頁顯示不同狀態。
// ─────────────────────────────────────────────────────────────────

export type EsimPhase =
  | 'awaitingPayment' // PROCESSING：金流還沒回，等付款確認
  | 'preparing'       // PAID / ESIM_PENDING：已付款，供應商開卡中
  | 'readyToInstall'  // COMPLETED 有 rcode、還沒按「我要安裝」→ 需要使用者動作
  | 'generatingQr'    // 已按安裝、QR 還沒到
  | 'installable'     // QR 已就緒、還沒激活 → 需要使用者掃碼
  | 'inUse'           // 已激活、還很健康
  | 'expiringSoon'    // 已激活、快到期（≤3 天）
  | 'ended'           // 已激活、使用期間已過
  | 'cancelled'       // 已取消
  | 'failed'          // 付款失敗
  | 'refunded'        // 已退款

export type EsimTone = 'wait' | 'action' | 'active' | 'warn' | 'error' | 'ended'

/** 判斷狀態所需的最小欄位（列表 / 詳情的 Order 結構都結構相容） */
export interface EsimStatusInput {
  status: string
  esimRcode?: string | null
  esimQrcode?: string | null
  redeemedAt?: string | null
  activatedAt?: string | null
  activationEnd?: string | null
}

export interface EsimStatusView {
  phase: EsimPhase
  label: string          // 短標籤，例如「使用中」
  hint: string           // 一句話說明「現在發生什麼／要做什麼」
  tone: EsimTone         // 配色語意
  actionNeeded: boolean  // true → 卡片要被凸顯（使用者得動作）
  daysLeft: number | null
}

const DAY = 86_400_000
const EXPIRING_DAYS = 3

/** 距離到期還有幾天（無條件進位）；沒有到期日回 null */
export function daysLeftOf(activationEnd?: string | null): number | null {
  if (!activationEnd) return null
  const end = new Date(activationEnd).getTime()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - Date.now()) / DAY)
}

export function deriveEsimStatus(o: EsimStatusInput): EsimStatusView {
  const daysLeft = daysLeftOf(o.activationEnd)
  const v = (
    phase: EsimPhase, label: string, hint: string,
    tone: EsimTone, actionNeeded = false,
  ): EsimStatusView => ({ phase, label, hint, tone, actionNeeded, daysLeft })

  // 終態優先
  if (o.status === 'FAILED')    return v('failed',    '付款未完成', '此訂單付款失敗', 'error')
  if (o.status === 'REFUNDED')  return v('refunded',  '已退款',     '款項已退回',     'ended')
  if (o.status === 'CANCELLED') return v('cancelled', '已取消',     '訂單已取消',     'ended')

  // 已激活 → 看到期日決定 inUse / expiringSoon / ended
  if (o.activatedAt) {
    if (daysLeft !== null && daysLeft < 0)
      return v('ended', '已結束', '使用期間已過', 'ended')
    if (daysLeft !== null && daysLeft <= EXPIRING_DAYS)
      return v('expiringSoon', '即將到期', daysLeft <= 0 ? '今天到期' : `剩 ${daysLeft} 天`, 'warn')
    return v('inUse', '使用中', daysLeft !== null ? `剩 ${daysLeft} 天` : '', 'active')
  }

  // 未激活：依 esim 欄位推進度（順序對應流程）
  if (o.esimQrcode)
    return v('installable', '待安裝', '掃描 QR 或一鍵安裝', 'action', true)
  if (o.redeemedAt)
    return v('generatingQr', '產生 QR 中', '正在生成安裝碼，約 1 分鐘', 'wait')
  if (o.esimRcode && o.status === 'COMPLETED')
    return v('readyToInstall', '可以安裝', '點「我要安裝」或轉贈好友', 'action', true)
  if (o.status === 'PROCESSING')
    return v('awaitingPayment', '等待付款', '正在確認付款結果', 'wait')
  return v('preparing', '開卡中', '正在向供應商開卡，約 1–3 分鐘，可先離開稍後再回來', 'wait')
}

/** tone → 固定配色。'action' 留給元件用品牌色覆蓋（這裡給藍色 fallback）。 */
export const TONE_STYLE: Record<EsimTone, { bg: string; border: string; fg: string }> = {
  wait:   { bg: '#fffbeb', border: '#fde68a', fg: '#a16207' },
  action: { bg: '#eff6ff', border: '#93c5fd', fg: '#1d4ed8' },
  active: { bg: '#ecfdf5', border: '#6ee7b7', fg: '#047857' },
  warn:   { bg: '#fff7ed', border: '#fed7aa', fg: '#c2410c' },
  error:  { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
  ended:  { bg: '#f8fafc', border: '#e2e8f0', fg: '#64748b' },
}

// ─── 分頁籤分組 ───────────────────────────────────────────────────
// 'processing' 不是分頁，是頂部橫幅（瞬時狀態，任何分頁都該看得到）。

// 'active' = 使用中（釘在頂部常駐，不是分頁）；'processing' = 處理中橫幅
export type OrdersGroup = 'active' | 'install' | 'history' | 'processing'

export function groupOf(phase: EsimPhase): OrdersGroup {
  switch (phase) {
    case 'inUse':
    case 'expiringSoon':
      return 'active'
    case 'readyToInstall':
    case 'installable':
    case 'generatingQr':
      return 'install'
    case 'awaitingPayment':
    case 'preparing':
      return 'processing'
    default:
      return 'history' // ended / cancelled / failed / refunded
  }
}

// 分頁籤只剩兩個：使用中已抽出常駐頂部、處理中是橫幅
export type OrdersTab = 'install' | 'history'

export const TAB_LABEL: Record<OrdersTab, string> = {
  install: '待安裝',
  history: '歷史',
}

export const TAB_ORDER: OrdersTab[] = ['install', 'history']
