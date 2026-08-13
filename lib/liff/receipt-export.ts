// 收據匯出（瀏覽器端）：把收據 DOM 轉 PNG。
// html2canvas 動態載入（不進主 bundle）；中文走瀏覽器原生字型，避開 serverless 產檔的字型問題。
// 收據版型全為 hex 顏色，html2canvas 相容。

async function toCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
}

// 收據 DOM → PNG Blob（供 LINE 轉發上傳，以及下載）。
export async function receiptToPngBlob(el: HTMLElement): Promise<Blob> {
  const canvas = await toCanvas(el)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('轉圖失敗'))), 'image/png'),
  )
}

// 下載收據圖片（PNG）。
export async function downloadReceiptImage(el: HTMLElement, filename: string): Promise<void> {
  const blob = await receiptToPngBlob(el)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
