import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LEN = 12   // 96-bit IV (recommended for GCM)
const TAG_LEN = 16  // 128-bit auth tag

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY
  if (!hex) throw new Error('FIELD_ENCRYPTION_KEY is not set')
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  return key
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output format (base64): IV(12) + AuthTag(16) + CipherText
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

/**
 * Decrypt a value encrypted by `encrypt()`.
 * Throws if the data is tampered or the key is wrong.
 */
export function decrypt(ciphertext: string): string {
  const data = Buffer.from(ciphertext, 'base64')
  const iv = data.subarray(0, IV_LEN)
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const encrypted = data.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/**
 * Try to decrypt; if it fails (e.g. legacy plaintext value), return as-is.
 * Use this for backward-compatibility when migrating existing plaintext data.
 */
export function safeDecrypt(value: string): string {
  if (!value) return value
  try {
    return decrypt(value)
  } catch {
    return value // not encrypted yet — return raw value
  }
}
