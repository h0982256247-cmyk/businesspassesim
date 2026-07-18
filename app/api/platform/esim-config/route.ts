import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getEsimConfig, upsertEsimConfig, maskSecret } from '@/lib/services/tenant-config'
import { AdminRole } from '@prisma/client'

async function guard(req: NextRequest) {
  const a = await requirePlatformAuth(req)
  if (a instanceof NextResponse) return a
  if (a.role !== AdminRole.SUPER_ADMIN) return NextResponse.json({ error: '權限不足' }, { status: 403 })
  return a
}

// GET /api/platform/esim-config — 世界移動設定（token 遮罩）
export async function GET(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const c = await getEsimConfig()
  return NextResponse.json({
    config: c ? {
      apiUrl: c.apiUrl, merchantId: c.merchantId, deptId: c.deptId,
      token: maskSecret(c.token), tokenSet: true, isActive: c.isActive,
    } : null,
  })
}

// PATCH /api/platform/esim-config — 更新（token 傳遮罩值代表沿用）
export async function PATCH(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const body = await req.json()
  if (!body.apiUrl || !body.merchantId || !body.deptId) {
    return NextResponse.json({ error: 'apiUrl / merchantId / deptId 必填' }, { status: 400 })
  }
  let token: string = body.token ?? ''
  if (token.startsWith('****')) {
    const cur = await getEsimConfig()
    token = cur?.token ?? ''
  }
  if (!token) return NextResponse.json({ error: 'token 必填' }, { status: 400 })

  await upsertEsimConfig({ apiUrl: body.apiUrl, merchantId: body.merchantId, deptId: body.deptId, token })
  return NextResponse.json({ ok: true })
}
