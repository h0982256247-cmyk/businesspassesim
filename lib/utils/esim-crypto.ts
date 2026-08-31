import { encrypt, safeDecrypt } from './crypto'

// eSIM 憑證欄位在 DB 的加解密單一來源。
//
// 這些欄位「就是商品本身」——拿到 esimLpa / esimQrcode 就能把卡直接灌進手機。
// email / phone / 金流金鑰 / WM token 早已是加密欄位，唯獨這批一直是明文
// （CLAUDE.md E 節已點名，列在 ROADMAP）。改為寫入前 encrypt、回傳前 safeDecrypt。
//
// 欄位清單刻意與 CLAUDE.md E 節「嚴禁外傳的 eSIM 欄位」一致，唯獨少了 esimRcode：
// 它被兩支 WM webhook 當查詢條件用（esim-redeemed 的 3.2 callback 只有 rcode
// 能定位訂單），而 AES-256-GCM 每次 IV 隨機、同一明文的密文都不同，加密後等值
// 查詢會直接失效。要一併加密得另加可查詢的 HMAC 雜湊欄位 + schema 遷移，另案處理。
// esimCfCode / esimApnExplain 是 APN 設定說明，非憑證，維持明文。
//
// 既有資料不需 backfill：safeDecrypt 對舊的明文值原樣回傳，舊列維持可讀，
// 只有新寫入的才是密文。
const ESIM_SECRET_FIELDS = [
  'esimQrcode', 'esimLpa', 'esimIccid',
  'esimPin1', 'esimPin2', 'esimPuk1', 'esimPuk2',
] as const

type EsimSecretField = (typeof ESIM_SECRET_FIELDS)[number]
type MaybeSecrets = Partial<Record<EsimSecretField, string | null | undefined>>

function mapSecrets<T extends MaybeSecrets>(obj: T, fn: (v: string) => string): T {
  const out: MaybeSecrets = { ...obj }
  for (const f of ESIM_SECRET_FIELDS) {
    const v = out[f]
    if (typeof v === 'string' && v !== '') out[f] = fn(v)
  }
  return out as T
}

/** 寫入 DB 前：把有帶到且有值的憑證欄位加密。未帶到的欄位不動。 */
export function encryptEsimFields<T extends MaybeSecrets>(data: T): T {
  return mapSecrets(data, encrypt)
}

/** 回傳給前端／後台／外部 API 前：解密憑證欄位（safeDecrypt 相容舊明文）。 */
export function decryptEsimFields<T extends MaybeSecrets>(order: T): T {
  return mapSecrets(order, safeDecrypt)
}

// ─── 擁有權遮蔽（P0-5）────────────────────────────────────────────
// 「授權」看的欄位比「加密」多一個 esimRcode：它因為要當查詢鍵所以維持明文不加密，
// 但它是世界移動的兌換碼——拿到就能去 WM 把這張卡兌換掉，權限上與 QR/LPA 同級。
// 兩份清單刻意放在一起，避免日後只改其中一份而漂移。
const ESIM_CREDENTIAL_FIELDS = [...ESIM_SECRET_FIELDS, 'esimRcode'] as const

type EsimCredentialField = (typeof ESIM_CREDENTIAL_FIELDS)[number]
type MaybeCredentials = Partial<Record<EsimCredentialField, string | null | undefined>>

/**
 * 非目前擁有者（例如轉贈後的原購買者）拿到的訂單一律經過這裡：
 * 可直接安裝／兌換／控制 eSIM 的欄位全部改成 null，其餘歷史 metadata 原樣保留。
 * 必須在 server 端做——前端隱藏不算數，response 本身就不能帶出去。
 */
export function redactEsimCredentials<T extends MaybeCredentials>(order: T): T {
  const out: MaybeCredentials = { ...order }
  for (const f of ESIM_CREDENTIAL_FIELDS) {
    if (f in out) out[f] = null
  }
  return out as T
}
