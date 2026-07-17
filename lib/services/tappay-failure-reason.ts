// 把 TapPay notify webhook 回傳的 status code 翻成中文使用者看得懂的訊息，
// 寫進 Order.failureReason 之後給前端顯示。
//
// 設計準則：
//   - 已知碼給明確中文敘述
//   - 未知碼附上原始 status + msg，方便客服追查
//   - 純函式，jsdom/node 都能跑單元測試

export const TAPPAY_USER_CANCEL_STATUS = 924  // LINE Pay 使用者於授權頁按取消

const KNOWN_STATUS_REASONS: Record<number, string> = {
  [TAPPAY_USER_CANCEL_STATUS]: '您已取消付款',
  // 信用卡常見拒絕碼
  10003: '銀行端拒絕授權（餘額不足或卡片限額）',
  10013: '卡號或安全碼錯誤',
  30040: '銀行拒絕交易（請聯絡發卡銀行）',
  88004: 'CCV／安全碼驗證失敗',
  // LINE Pay
  920: 'LINE Pay 系統異常，請改用其他付款方式',
  922: 'LINE Pay 餘額不足',
  923: 'LINE Pay 授權失敗',
}

export interface TapPayFailureInput {
  status: number | null | undefined
  msg?: string | null
}

export function mapTapPayFailureReason(input: TapPayFailureInput): string {
  const { status, msg } = input
  if (status == null) return '付款失敗，請重試'
  const known = KNOWN_STATUS_REASONS[status]
  if (known) return known
  // 未知碼：把原始資訊一起塞進去方便客服追，但不要太冗長
  const tail = msg ? `：${String(msg).slice(0, 80)}` : ''
  return `付款失敗（代碼 ${status}${tail}）`
}

export function isUserCancelStatus(status: number | null | undefined): boolean {
  return status === TAPPAY_USER_CANCEL_STATUS
}
