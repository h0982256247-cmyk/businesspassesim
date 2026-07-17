import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { PlatformAdminRole } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { safeDecrypt } from '@/lib/utils/crypto'

type Params = { params: Promise<{ id: string }> }

// POST /api/platform/admins/:id/line-test
// 測試該租戶的 Messaging API Access Token 是否有效：呼叫 LINE 的 /v2/bot/info。
// body.token 可帶「尚未儲存」的新 token（遮罩值 **** 則改用已存的）。token 不回傳、不留存。
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  // 權限：SUPER_ADMIN 或本人 / 其下線（與帳號 PATCH 同一套租戶隔離）
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    const target = await prisma.platformAdmin.findUnique({ where: { id }, select: { parentId: true } })
    if (!target) return NextResponse.json({ error: '帳號不存在' }, { status: 404 })
    if (id !== auth.adminId && target.parentId !== auth.adminId) {
      return NextResponse.json({ error: '無權操作此帳號' }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const passed = typeof body?.token === 'string' ? body.token.trim() : ''

  let token = ''
  if (passed && !passed.startsWith('****')) {
    token = passed
  } else {
    const admin = await prisma.platformAdmin.findUnique({ where: { id }, select: { lineAccessToken: true } })
    token = admin?.lineAccessToken ? safeDecrypt(admin.lineAccessToken) : ''
  }

  if (!token) return NextResponse.json({ ok: false, error: '尚未設定 Channel Access Token' }, { status: 200 })

  try {
    const res = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // LINE 回 401/403 等：token 無效或權限不足
      return NextResponse.json({ ok: false, error: data?.message ?? `LINE 回應 ${res.status}` }, { status: 200 })
    }
    return NextResponse.json({
      ok: true,
      displayName: data?.displayName ?? null,
      basicId: data?.basicId ?? null,
      premiumId: data?.premiumId ?? null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '連線失敗' }, { status: 200 })
  }
}
