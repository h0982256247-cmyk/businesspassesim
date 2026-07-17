import { describe, it, expect, vi, beforeEach } from 'vitest'

// 用 vi.mock 攔截 prisma 與 session 驗證；vi.mock 會被 hoist 到檔案頂端，
// 所以 mock 函式必須走 vi.hoisted 才能在 factory 裡安全引用。
const { findUnique, verifySession } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verifySession: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique } },
}))
vi.mock('@/lib/auth/session', () => ({
  verifySession,
  SESSION_COOKIE: 'esim_session',
}))

import { resolveTenantAdminIdFromToken } from '@/lib/auth/resolve-tenant'

describe('resolveTenantAdminIdFromToken', () => {
  beforeEach(() => {
    findUnique.mockReset()
    verifySession.mockReset()
  })

  it('returns null without hitting DB when no token is provided', async () => {
    expect(await resolveTenantAdminIdFromToken(undefined)).toBeNull()
    expect(verifySession).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('returns null without hitting DB when token verification fails', async () => {
    verifySession.mockRejectedValue(new Error('bad token'))
    expect(await resolveTenantAdminIdFromToken('bogus')).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('uses tenantAdminId from JWT payload directly (no DB roundtrip — the perf win)', async () => {
    verifySession.mockResolvedValue({ userId: 'u1', lineUid: 'L1', tenantAdminId: 'tenant_42' })
    const result = await resolveTenantAdminIdFromToken('valid')
    expect(result).toBe('tenant_42')
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('handles JWT payload with explicit null tenantAdminId (user not assigned to a tenant)', async () => {
    verifySession.mockResolvedValue({ userId: 'u1', lineUid: 'L1', tenantAdminId: null })
    expect(await resolveTenantAdminIdFromToken('valid')).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('falls back to DB lookup for legacy tokens missing tenantAdminId', async () => {
    verifySession.mockResolvedValue({ userId: 'u-legacy', lineUid: 'L1' }) // no tenantAdminId field
    findUnique.mockResolvedValue({ tenantAdminId: 'tenant_legacy' })
    const result = await resolveTenantAdminIdFromToken('legacy')
    expect(result).toBe('tenant_legacy')
    expect(findUnique).toHaveBeenCalledOnce()
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u-legacy' },
      select: { tenantAdminId: true },
    })
  })

  it('returns null when fallback DB lookup finds no user', async () => {
    verifySession.mockResolvedValue({ userId: 'u-deleted', lineUid: 'L1' })
    findUnique.mockResolvedValue(null)
    expect(await resolveTenantAdminIdFromToken('legacy')).toBeNull()
  })
})
