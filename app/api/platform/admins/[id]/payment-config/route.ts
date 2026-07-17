import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getPaymentConfigs, getPaymentConfig, upsertPaymentConfig, setPaymentConfigActive, maskSecret } from '@/lib/services/tenant-config'
import { PlatformAdminRole } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// GET /api/platform/admins/:id/payment-config
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }
  const { id } = await params
  // service 統一回解密值；此處只回遮罩，完整 partnerKey / appKey 永不回傳
  const configs = await getPaymentConfigs(id)
  return NextResponse.json({
    configs: configs.map(c => ({
      id: c.id,
      gateway: c.gateway,
      partnerKey: maskSecret(c.partnerKey),
      merchantId: c.merchantId,
      appId: c.appId ?? '',
      appKey: c.appKey ? maskSecret(c.appKey) : '',
      env: c.env,
      isActive: c.isActive,
      updatedAt: c.updatedAt,
    })),
  })
}

// PUT /api/platform/admins/:id/payment-config
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }
  const { id } = await params
  const body = await req.json()
  const { gateway, partnerKey, merchantId, env = 'sandbox', appId, appKey } = body

  if (!gateway || !partnerKey) {
    return NextResponse.json({ error: '請填寫所有必要欄位' }, { status: 400 })
  }

  // 既有設定（解密後）；遮罩「沿用現有」時取用。加密一律交給 upsertPaymentConfig，
  // route 不自行 encrypt、也不直接寫 prisma（單一來源）。
  const existing = await getPaymentConfig(id, gateway)

  // partnerKey（必填、機密）：遮罩 → 沿用現有；新值 → 直接用（service 會加密）
  let finalKey: string
  if (partnerKey.startsWith('****')) {
    if (!existing) return NextResponse.json({ error: 'Partner Key 不可為遮罩值' }, { status: 400 })
    finalKey = existing.partnerKey
  } else {
    finalKey = partnerKey
  }

  // appKey（前端 client key）：空 → 不變更；遮罩 → 沿用現有；新值 → 直接用
  let finalAppKey: string | undefined
  if (!appKey) {
    finalAppKey = undefined
  } else if (appKey.startsWith('****')) {
    finalAppKey = existing?.appKey ?? undefined
  } else {
    finalAppKey = appKey
  }

  try {
    await upsertPaymentConfig(id, {
      gateway,
      partnerKey: finalKey,
      merchantId,
      env,
      appId: appId || undefined,
      appKey: finalAppKey,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}

// PATCH /api/platform/admins/:id/payment-config — 切換前台顯示開關（只動 isActive）
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    return NextResponse.json({ error: '權限不足' }, { status: 403 })
  }
  const { id } = await params
  const { gateway, isActive } = await req.json()
  if (!gateway || typeof isActive !== 'boolean') {
    return NextResponse.json({ error: '參數不完整' }, { status: 400 })
  }
  // 必須已有該金流設定才能開關（沒設定 Merchant ID/金鑰就無從付款）
  const existing = await getPaymentConfig(id, gateway)
  if (!existing) {
    return NextResponse.json({ error: '請先完成該金流設定（Merchant ID／金鑰）再開啟' }, { status: 400 })
  }
  try {
    await setPaymentConfigActive(id, gateway, isActive)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
