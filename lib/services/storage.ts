// Supabase Storage 上傳（REST + service role，不引入 @supabase/supabase-js）。
// 首圖 / 商城頂圖 / 國家圖片存成檔案、DB 只留公開網址；避免把大圖 base64 塞進
// 「每次開前台都讀」的 PlatformSetting 拖慢前台。bucket 不存在時自動建立（public read）。
import { randomUUID } from 'node:crypto'

const BUCKET = 'public-assets'
const PREFIX = 'appearance'

function creds() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定，無法上傳圖片')
  }
  return { url, key, headers: { Authorization: `Bearer ${key}`, apikey: key } as Record<string, string> }
}

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif',
}

let bucketReady = false
async function ensureBucket(url: string, headers: Record<string, string>) {
  if (bucketReady) return
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  if (res.ok) { bucketReady = true; return }
  const txt = await res.text().catch(() => '')
  // 已存在 → 視為成功（Supabase 回 400/409 且訊息含 "already exists"）
  if (res.status === 409 || /exist/i.test(txt)) { bucketReady = true; return }
  throw new Error(`建立 storage bucket 失敗：${res.status} ${txt}`)
}

/** 上傳一張圖，回傳公開網址。kind 只用來讓檔名可讀（home / shop / dest）；唯一性靠 uuid。 */
export async function uploadPublicImage(kind: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const { url, headers } = creds()
  await ensureBucket(url, headers)
  const ext = EXT[contentType] ?? 'bin'
  const objectPath = `${PREFIX}/${kind}-${randomUUID()}.${ext}`
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType, 'cache-control': '31536000', 'x-upsert': 'true' },
    body: Buffer.from(bytes),
  })
  if (!res.ok) throw new Error(`上傳圖片失敗：${res.status} ${await res.text().catch(() => '')}`)
  return `${url}/storage/v1/object/public/${BUCKET}/${objectPath}`
}

/** 盡力刪掉舊圖（換圖／移除時清孤兒檔）；失敗不拋、回傳是否成功。非本 bucket 的網址（如舊 pexels 預設）略過。 */
export async function deletePublicImage(publicUrl: string | null | undefined): Promise<boolean> {
  if (!publicUrl) return false
  let url: string, headers: Record<string, string>
  try { ({ url, headers } = creds()) } catch { return false }
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = publicUrl.indexOf(marker)
  if (idx < 0) return false
  const objectPath = publicUrl.slice(idx + marker.length)
  try {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, { method: 'DELETE', headers })
    return res.ok
  } catch { return false }
}
