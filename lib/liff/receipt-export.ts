// 收據匯出（瀏覽器端）：把收據 DOM 轉 PNG／PDF。
// html2canvas＋jspdf 動態載入（不進主 bundle）；中文走瀏覽器原生字型，
// 避開 serverless 產檔的字型問題。收據版型全為 hex 顏色，html2canvas 相容。

async function toCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default
  return html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false })
}

// 下載 PDF（A4 直式，收據等比置中）。
export async function downloadReceiptPdf(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await toCanvas(el)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const margin = 24
  const w = pdf.internal.pageSize.getWidth() - margin * 2
  const h = (canvas.height / canvas.width) * w
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, w, h)
  pdf.save(filename)
}

// 收據 DOM → PNG Blob（供 LINE 轉發上傳）。
export async function receiptToPngBlob(el: HTMLElement): Promise<Blob> {
  const canvas = await toCanvas(el)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('轉圖失敗'))), 'image/png'),
  )
}
