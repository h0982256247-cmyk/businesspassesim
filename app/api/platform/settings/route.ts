import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getPlatformSettings, updatePlatformSettings, maskSecret } from '@/lib/services/tenant-config'
import { AdminRole } from '@prisma/client'

async function guard(req: NextRequest) {
  const a = await requirePlatformAuth(req)
  if (a instanceof NextResponse) return a
  if (a.role !== AdminRole.SUPER_ADMIN) return NextResponse.json({ error: '權限不足' }, { status: 403 })
  return a
}

// GET /api/platform/settings — 品牌 / 網域 / 福利價倍率（LINE token 遮罩）
export async function GET(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const s = await getPlatformSettings()
  return NextResponse.json({
    settings: {
      benefitMarkupRate: s.benefitMarkupRate,
      brandName: s.brandName,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      lineOaUrl: s.lineOaUrl,
      liffId: s.liffId,
      domain: s.domain,
      transferEnabled: s.transferEnabled,
      lineChannelToken: s.lineChannelToken ? maskSecret(s.lineChannelToken) : '',
      lineChannelTokenSet: !!s.lineChannelToken,
    },
  })
}

// PATCH /api/platform/settings — 更新（lineChannelToken 傳遮罩值代表沿用）
export async function PATCH(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const body = await req.json()
  if (body.benefitMarkupRate !== undefined) {
    const n = Number(body.benefitMarkupRate)
    if (!Number.isFinite(n) || n < 1 || n > 5) {
      return NextResponse.json({ error: '福利價倍率須介於 1 ~ 5' }, { status: 400 })
    }
  }
  await updatePlatformSettings(body)
  return NextResponse.json({ ok: true })
}
