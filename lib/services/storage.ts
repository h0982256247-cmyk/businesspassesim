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

// ─── 私有 bucket（名片／工作證等個資圖）─────────────────────────────
// 與公開 bucket 分開：個資檔不可公開讀取，DB 只存「物件路徑」（非公開網址）；
// 讀取一律經後端授權後以 byte-proxy 串回（見 getPrivateImage）。獨立的 ready flag。
const PRIVATE_BUCKET = 'member-credentials'
const CRED_PREFIX = 'credentials'

let privateBucketReady = false
async function ensurePrivateBucket(url: string, headers: Record<string, string>) {
  if (privateBucketReady) return
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: PRIVATE_BUCKET, name: PRIVATE_BUCKET, public: false }),
  })
  if (res.ok) { privateBucketReady = true; return }
  const txt = await res.text().catch(() => '')
  if (res.status === 409 || /exist/i.test(txt)) { privateBucketReady = true; return }
  throw new Error(`建立私有 storage bucket 失敗：${res.status} ${txt}`)
}

/** 上傳一張私有圖，回傳「物件路徑」（非公開網址）。kind 只讓檔名可讀；唯一性靠 uuid。 */
export async function uploadPrivateImage(kind: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const { url, headers } = creds()
  await ensurePrivateBucket(url, headers)
  const ext = EXT[contentType] ?? 'bin'
  const objectPath = `${CRED_PREFIX}/${kind}-${randomUUID()}.${ext}`
  const res = await fetch(`${url}/storage/v1/object/${PRIVATE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: Buffer.from(bytes),
  })
  if (!res.ok) throw new Error(`上傳圖片失敗：${res.status} ${await res.text().catch(() => '')}`)
  return objectPath
}

/** 讀取私有圖（service role 略過 storage RLS）；回傳位元組 + content-type，找不到回 null。 */
export async function getPrivateImage(
  objectPath: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const { url, headers } = creds()
  const res = await fetch(`${url}/storage/v1/object/authenticated/${PRIVATE_BUCKET}/${objectPath}`, { headers })
  if (!res.ok) return null
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const bytes = await res.arrayBuffer()
  return { bytes, contentType }
}

/** 盡力刪掉私有圖（換圖／重新申請時清孤兒檔）；失敗不拋、回傳是否成功。 */
export async function deletePrivateImage(objectPath: string | null | undefined): Promise<boolean> {
  if (!objectPath) return false
  let url: string, headers: Record<string, string>
  try { ({ url, headers } = creds()) } catch { return false }
  try {
    const res = await fetch(`${url}/storage/v1/object/${PRIVATE_BUCKET}/${objectPath}`, { method: 'DELETE', headers })
    return res.ok
  } catch { return false }
}
