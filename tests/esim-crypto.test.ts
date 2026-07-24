import { describe, it, expect } from 'vitest'

// 測試用固定金鑰（64 hex = 32 bytes）。必須在 import 加解密模組「之前」設好，
// 故用頂層賦值 + 動態 import（beforeAll 會晚於模組載入，來不及）。
process.env.FIELD_ENCRYPTION_KEY ??= 'a'.repeat(64)

const { encryptEsimFields, decryptEsimFields } = await import('@/lib/utils/esim-crypto')

// eSIM 憑證欄位「就是商品本身」——拿到 esimLpa / esimQrcode 就能把卡灌進手機，
// 原本卻是明文存 DB。此測試鎖住：寫入前加密、讀取後還原、舊明文仍可讀，
// 以及 esimRcode 絕不可被加密（兩支 WM webhook 拿它當查詢條件）。
describe('esim-crypto — eSIM 憑證欄位加解密', () => {
  const plain = {
    esimQrcode: 'https://wm.example/qr/abc.png',
    esimLpa: 'LPA:1$rsp.example$MATCHING-ID-123',
    esimIccid: '8988303000012345678',
    esimPin1: '1234',
    esimPuk1: '87654321',
  }

  it('加密後密文與明文不同，解密可還原', () => {
    const enc = encryptEsimFields(plain)
    expect(enc.esimLpa).not.toBe(plain.esimLpa)
    expect(enc.esimQrcode).not.toBe(plain.esimQrcode)
    expect(decryptEsimFields(enc)).toEqual(plain)
  })

  it('同一明文兩次加密的密文不同（隨機 IV）→ 故不可拿來做等值查詢', () => {
    const a = encryptEsimFields({ esimLpa: 'LPA:1$x$y' }).esimLpa
    const b = encryptEsimFields({ esimLpa: 'LPA:1$x$y' }).esimLpa
    expect(a).not.toBe(b)
  })

  it('esimRcode 不被加密：兩支 WM webhook 用它當 where 條件定位訂單', () => {
    const out = encryptEsimFields({ ...plain, esimRcode: 'RC123456' } as never) as Record<string, string>
    expect(out.esimRcode).toBe('RC123456')
  })

  it('舊的明文資料原樣讀回（safeDecrypt 相容，既有列不需 backfill）', () => {
    expect(decryptEsimFields(plain)).toEqual(plain)
  })

  it('null / undefined / 空字串不動，不會變成密文', () => {
    const out = encryptEsimFields({ esimQrcode: null, esimLpa: undefined, esimIccid: '' })
    expect(out).toEqual({ esimQrcode: null, esimLpa: undefined, esimIccid: '' })
  })

  it('未帶到的欄位不會被憑空加上', () => {
    expect(Object.keys(encryptEsimFields({ esimLpa: 'x' }))).toEqual(['esimLpa'])
  })
})
