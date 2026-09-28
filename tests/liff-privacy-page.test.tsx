import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { messages } from '@/lib/liff/messages'
import PrivacyPage from '@/app/liff/[slug]/privacy/page'

const push = vi.fn()
let lineOaUrl: string | null = null

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/hooks/useLiffBase', () => ({ useLiffBase: () => '/liff/demo' }))
vi.mock('@/components/liff/LocaleProvider', () => ({ useT: () => ({ t: messages.zh }) }))
vi.mock('@/components/liff/TenantContext', () => ({
  useTenant: () => ({ lineOaUrl }),
  useTenantColors: () => ({ light: '#eef', primaryText: '#123' }),
}))

beforeEach(() => {
  push.mockClear()
  lineOaUrl = null
})

describe('LIFF 隱私權政策頁', () => {
  it('顯示七節條文與第五節七款例外', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: '隱私權政策' })).toBeTruthy()
    const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titles).toEqual([...messages.zh.privacy.sections.map(s => s.h), '聯繫管道'])
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
  })

  it('未設定 LINE OA 時，聯繫按鈕導到客服中心', () => {
    render(<PrivacyPage />)
    fireEvent.click(screen.getByRole('button', { name: '前往客服中心' }))
    expect(push).toHaveBeenCalledWith('/liff/demo/support')
  })

  it('有設定 LINE OA 時，聯繫按鈕另開 LINE 連結', () => {
    lineOaUrl = 'https://lin.ee/demo'
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<PrivacyPage />)
    fireEvent.click(screen.getByRole('button', { name: 'LINE 官方帳號客服' }))
    expect(open).toHaveBeenCalledWith('https://lin.ee/demo', '_blank', 'noopener,noreferrer')
    expect(push).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
