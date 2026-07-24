import { describe, it, expect, vi, beforeEach } from 'vitest'

// 回歸鎖：限流器自身失效時必須「放行 + 留下 log」，不可擋下請求。
//
// 由來（真實事故）：後台登入曾用 fail-closed，而 rate_limits 表當時根本不存在
// （schema 從未定義），INSERT 每次丟例外 → 一律回擋 → 後台永遠 429，管理員被
// 自己的限流鎖在門外；又因為 catch 是空的、沒有任何 log，完全查不出原因。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
}))

import { checkRateLimit } from '@/lib/utils/rate-limit'
import { prisma } from '@/lib/db/prisma'

describe('checkRateLimit — 限流器失效時的行為', () => {
  beforeEach(() => vi.clearAllMocks())

  it('DB 丟例外（如 rate_limits 表不存在）→ 放行，不可擋下', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error('relation "rate_limits" does not exist'),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(checkRateLimit('admin-login:ip:1.2.3.4', 10, 300)).resolves.toBe(true)

    // 必須留下 log，否則壞掉也沒人知道
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('log 不可洩漏 IP／帳號等識別資料（只印 scope 前綴）', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('boom'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await checkRateLimit('admin-login:acct:someone@example.com', 20, 900)

    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('someone@example.com')
    expect(logged).toContain('admin-login')
    spy.mockRestore()
  })

  it('計數未超過上限 → 放行', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 10 }])
    await expect(checkRateLimit('admin-login:ip:1.2.3.4', 10, 300)).resolves.toBe(true)
  })

  it('計數超過上限 → 擋下（限流本身仍要有效）', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 11 }])
    await expect(checkRateLimit('admin-login:ip:1.2.3.4', 10, 300)).resolves.toBe(false)
  })
})
