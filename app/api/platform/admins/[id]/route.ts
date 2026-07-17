import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { toggleAdminActive, updateAdminPassword, updateMaxRebateRate } from '@/lib/services/platform-admin'
import { PlatformAdminRole } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { encrypt, safeDecrypt } from '@/lib/utils/crypto'

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/admins/:id  — fetch a single Platform Admin (SUPER_ADMIN only)
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params

  let admin
  try {
    admin = await prisma.platformAdmin.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        maxRebateRate: true,
        tenantSlug: true,
        brandName: true,
        liffId: true,
        logoUrl: true,
        primaryColor: true,
        lineAccessToken: true,
        lineOaUrl: true,
        _count: { select: { ownedGroups: true } },
      },
    })
  } catch (e) {
    console.error('Admin GET DB error:', e)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    admin: {
      ...admin,
      lineAccessToken: admin.lineAccessToken
        ? '****' + safeDecrypt(admin.lineAccessToken).slice(-4)
        : null,
    },
  })
}

// PATCH /api/platform/admins/:id  — toggle active, change password, or set maxRebateRate
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== PlatformAdminRole.SUPER_ADMIN && auth.role !== PlatformAdminRole.PLATFORM_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }

  const { id } = await params

  // 租戶隔離：非 SUPER_ADMIN 只能操作自己本人或自己建立的下線（parentId === 自己）。
  // 少了這層檢查，任何 Platform Admin 都能改別租戶管理員的密碼／停權／品牌設定 → 跨租戶接管。
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    const target = await prisma.platformAdmin.findUnique({
      where: { id },
      select: { parentId: true },
    })
    if (!target) return NextResponse.json({ error: '帳號不存在' }, { status: 404 })
    if (id !== auth.adminId && target.parentId !== auth.adminId) {
      return NextResponse.json({ error: '無權操作此帳號' }, { status: 403 })
    }
  }

  const body = await req.json()

  if (typeof body.isActive === 'boolean') {
    await toggleAdminActive(id, body.isActive)
    return NextResponse.json({ ok: true })
  }

  if (body.newPassword) {
    await updateAdminPassword(id, body.newPassword)
    return NextResponse.json({ ok: true })
  }

  // 僅 SUPER_ADMIN 可設定讓利上限
  if (typeof body.maxRebateRate === 'number') {
    if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
      return NextResponse.json({ error: '只有 Super Admin 可設定讓利上限' }, { status: 403 })
    }
    try {
      await updateMaxRebateRate(id, body.maxRebateRate)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 400 })
    }
  }

  if (body.brandName !== undefined || body.tenantSlug !== undefined || body.liffId !== undefined || body.logoUrl !== undefined || body.primaryColor !== undefined || body.lineAccessToken !== undefined || body.lineOaUrl !== undefined) {
    const updateData: Record<string, unknown> = {}
    if (body.brandName !== undefined) updateData.brandName = body.brandName
    // Slug 一經設定即鎖死：避免後續變更 URL 後 LINE LIFF endpoint、TapPay
    // result_url、群組分享連結、使用者書籤全部失效。要更名請走客服流程。
    if (body.tenantSlug !== undefined) {
      const existing = await prisma.platformAdmin.findUnique({
        where: { id },
        select: { tenantSlug: true },
      })
      const currentSlug = existing?.tenantSlug ?? ''
      const nextSlug = (body.tenantSlug as string) ?? ''
      if (currentSlug && currentSlug !== nextSlug) {
        return NextResponse.json(
          { error: 'Slug 一經設定即無法變更（會讓既有 LIFF 與付款連結失效）' },
          { status: 422 },
        )
      }
      if (!currentSlug) updateData.tenantSlug = nextSlug   // 首次設定才寫入
    }
    if (body.liffId !== undefined) updateData.liffId = body.liffId
    if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl
    if (body.lineOaUrl !== undefined) updateData.lineOaUrl = (body.lineOaUrl as string)?.trim() || null
    if (body.primaryColor !== undefined) updateData.primaryColor = body.primaryColor
    if (body.lineAccessToken !== undefined) {
      // If masked value passed back, keep existing encrypted value
      if (body.lineAccessToken && body.lineAccessToken.startsWith('****')) {
        const existing = await prisma.platformAdmin.findUnique({ where: { id }, select: { lineAccessToken: true } })
        updateData.lineAccessToken = existing?.lineAccessToken ?? null
      } else {
        updateData.lineAccessToken = body.lineAccessToken ? encrypt(body.lineAccessToken) : null
      }
    }
    try {
      await prisma.platformAdmin.update({ where: { id }, data: updateData })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 400 })
    }
  }

  return NextResponse.json({ error: '無效請求' }, { status: 400 })
}

// DELETE /api/platform/admins/:id — 移除帳號（僅 SUPER_ADMIN，不可刪自己或其他 SUPER_ADMIN）
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '只有 Super Admin 可移除帳號' }, { status: 403 })
  }

  const { id } = await params

  if (id === auth.adminId) {
    return NextResponse.json({ error: '不可刪除自己的帳號' }, { status: 400 })
  }

  const target = await prisma.platformAdmin.findUnique({
    where: { id },
    select: { role: true, _count: { select: { ownedGroups: true } } },
  })

  if (!target) return NextResponse.json({ error: '帳號不存在' }, { status: 404 })

  if (target.role === PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '不可刪除 Super Admin 帳號' }, { status: 400 })
  }

  if (target._count.ownedGroups > 0) {
    return NextResponse.json({ error: '此帳號仍有關聯社群，請先移轉或刪除社群後再移除帳號' }, { status: 400 })
  }

  try {
    await prisma.platformAdmin.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
