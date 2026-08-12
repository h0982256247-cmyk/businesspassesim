// 收據工具：收據編號格式 + 金額轉國字大寫（依收據附圖的固定版位格式）。

// 收據編號：W + 西元年後2碼 + 月 + 日 + L + 4 位流水，例：W260808L0001。
// 年月日取「購買日（台灣時區）」，由呼叫端算好再傳入；seq 為當日流水（原子遞增）。
export function formatReceiptNumber(year: number, month: number, day: number, seq: number): string {
  const yy = String(year % 100).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const n4 = String(seq).padStart(4, '0')
  return `W${yy}${mm}${dd}L${n4}`
}

const TWD_DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖']

// 位權標籤（依右起位置 p）：個位=元，其餘 拾/佰/仟 循環，每 4 位補 萬/億/兆。
function unitLabel(p: number): string {
  if (p === 0) return '元'
  const r = p % 4
  if (r === 1) return '拾'
  if (r === 2) return '佰'
  if (r === 3) return '仟'
  return ['', '萬', '億', '兆'][p / 4] ?? '萬'
}

// 金額轉國字大寫，依附圖固定版位：每一位都顯示（零補），最少補到「佰萬」位，結尾「整」。
// 例：211 → 零佰零拾零萬零仟貳佰壹拾壹元整
export function amountToTwdWords(amount: number): string {
  const n = Math.max(0, Math.round(amount))
  const digs = String(n).padStart(Math.max(7, String(n).length), '0')
  let s = ''
  const len = digs.length
  for (let i = 0; i < len; i++) {
    s += TWD_DIGITS[Number(digs[i])] + unitLabel(len - 1 - i)
  }
  return s + '整'
}
