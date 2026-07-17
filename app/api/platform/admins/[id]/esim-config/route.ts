import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getEsimConfig, upsertEsimConfig, maskSecret } from '@/lib/services/tenant-config'
import { PlatformAdminRole } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/admins/:id/esim-config
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }
  const { id } = await params
  // service 統一回解密 token；此處只回遮罩，完整 token 永不回傳
  const cfg = await getEsimConfig(id)
  if (!cfg) return NextResponse.json({ config: null })
  return NextResponse.json({
    config: {
      id: cfg.id,
      provider: cfg.provider,
      apiUrl: cfg.apiUrl,
      merchantId: cfg.merchantId,
      deptId: cfg.deptId,
      token: maskSecret(cfg.token),
      isActive: cfg.isActive,
      updatedAt: cfg.updatedAt,
    },
  })
}

// PUT /api/platform/admins/:id/esim-config
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { provider = 'worldmove', apiUrl, merchantId, deptId, token } = body

  if (!apiUrl || !merchantId || !deptId || !token) {
    return NextResponse.json({ error: '請填寫所有必要欄位' }, { status: 400 })
  }

  // 加密一律交給 upsertEsimConfig（單一來源）；route 不自行 encrypt、也不直接寫 prisma。
  // token 遮罩 → 沿用現有解密值；新值 → 直接用（service 會加密）
  const existing = await getEsimConfig(id)
  let finalToken: string
  if (token.startsWith('****')) {
    if (!existing) return NextResponse.json({ error: 'Token 不可為遮罩值（請輸入完整 token）' }, { status: 400 })
    finalToken = existing.token
  } else {
    finalToken = token
  }

  try {
    await upsertEsimConfig(id, { provider, apiUrl, merchantId, deptId, token: finalToken })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
