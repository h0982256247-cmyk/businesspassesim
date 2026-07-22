// 訂單狀態徽章：全後台「文案 + 配色」的單一來源。
// 過去儀表板／訂單列表／訂單詳情／會員詳情各自定義一份，彼此不一致
// （例如 PAID 在會員頁誤標成綠色、REFUNDED 紅灰混用、PAID 文案「已付款」與「付款成功」並存）。
// 一律改用 <OrderStatusBadge>；需要純文字（如篩選鈕標籤）時用 ORDER_STATUS_META。
// 配色原則：紅色只給「需注意」的異常（付款失敗）；已退款／已取消屬正常終態，用灰。

export const ORDER_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING:      { label: '待付款',     cls: 'bg-yellow-50 text-yellow-600' },
  PROCESSING:   { label: '待付款',     cls: 'bg-yellow-50 text-yellow-600' },
  PAID:         { label: '已付款',     cls: 'bg-blue-50 text-blue-600' },
  COMPLETED:    { label: '已完成發送', cls: 'bg-green-50 text-green-600' },
  ESIM_PENDING: { label: '待發送',     cls: 'bg-orange-50 text-orange-600' },
  FAILED:       { label: '付款失敗',   cls: 'bg-red-50 text-red-500' },
  REFUNDED:     { label: '已退款',     cls: 'bg-slate-100 text-slate-500' },
  CANCELLED:    { label: '已取消',     cls: 'bg-gray-100 text-gray-400' },
}

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{s.label}
    </span>
  )
}
