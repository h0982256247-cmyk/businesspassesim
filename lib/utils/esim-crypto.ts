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
