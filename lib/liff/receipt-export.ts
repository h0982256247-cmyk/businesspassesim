// 收據匯出（瀏覽器端）：把收據 DOM 轉 PNG Blob（供下載與 LINE 轉發共用）。
// html2canvas 動態載入（不進主 bundle）；中文走瀏覽器原生字型，避開 serverless 產檔字型問題。
// 收據版型全為 hex 顏色，html2canvas 相容。
export async function receiptToPngBlob(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('轉圖失敗'))), 'image/png'),
  )
}
