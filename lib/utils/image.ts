// 前端圖片縮圖工具（單一來源）。把使用者選的圖縮到最長邊 maxEdge、輸出 JPEG Blob 再上傳，
// 避開 Vercel serverless body 上限、上傳更快。原本各自定義在 appearance 後台頁，
// 現收斂於此供「後台外觀圖」與「加入企業上傳名片/工作證」共用。
//
// 只在瀏覽器可用（用到 FileReader / canvas）；請勿在 server component / route 呼叫。

/**
 * 把圖片檔縮到最長邊不超過 maxEdge，輸出 JPEG Blob。
 * @param maxEdge 最長邊像素上限（預設 1600；證件/名片要看清字用較高解析）
 * @param quality JPEG 品質 0–1（預設 0.82）
 */
export function resizeToBlob(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('讀取失敗'))
    reader.onload = () => {
      const img = document.createElement('img')
      img.onerror = () => reject(new Error('圖片解析失敗'))
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('無法建立畫布'))
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('轉檔失敗'))), 'image/jpeg', quality)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
