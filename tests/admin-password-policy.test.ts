import { describe, it, expect } from 'vitest'
import { validateAdminPassword, ADMIN_PASSWORD_MIN_LENGTH } from '@/lib/services/platform-admin'

// 後台帳號即最高權限，且 /platform/login 對外開放。此測試鎖住密碼門檻，避免日後
// 有人為了方便把長度調回 8 碼或拿掉英數混合規則（原本完全沒有檢查，1 碼也建得起來）。
describe('validateAdminPassword — 後台密碼政策', () => {
  it('長度不足 → 擋下並說明門檻', () => {
    expect(validateAdminPassword('Abc12345')).toBe(`密碼至少需 ${ADMIN_PASSWORD_MIN_LENGTH} 碼`)
  })

  it('只有英文或只有數字 → 擋下', () => {
    expect(validateAdminPassword('abcdefghijklmn')).toBe('密碼需同時包含英文字母與數字')
    expect(validateAdminPassword('123456789012345')).toBe('密碼需同時包含英文字母與數字')
  })

  it('長度足夠且英數混合 → 通過', () => {
    expect(validateAdminPassword('Str0ngPassw0rd')).toBeNull()
  })

  it('非字串（漏傳 / 型別錯）→ 擋下，不可當成通過', () => {
    expect(validateAdminPassword(undefined)).toBe('密碼格式不正確')
    expect(validateAdminPassword(null)).toBe('密碼格式不正確')
    expect(validateAdminPassword(12345678901234)).toBe('密碼格式不正確')
  })
})
