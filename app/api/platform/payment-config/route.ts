import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getPaymentConfigs, getPaymentConfig, upsertPaymentConfig, setPaymentConfigActive, maskSecret } from '@/lib/services/tenant-config'
import { AdminRole } from '@prisma/client'

async function guard(req: NextRequest) {
  const a = await requirePlatformAuth(req)
  if (a instanceof NextResponse) return a
  if (a.role !== AdminRole.SUPER_ADMIN) return NextResponse.json({ error: '權限不足' }, { status: 403 })
  return a
}

type Cfg = Awaited<ReturnType<typeof getPaymentConfigs>>[number]
function shape(c: Cfg | undefined) {
  if (!c) return null
  return {
    gateway: c.gateway, merchantId: c.merchantId, appId: c.appId,
    appKey: c.appKey ? maskSecret(c.appKey) : '', appKeySet: !!c.appKey,
    partnerKey: maskSecret(c.partnerKey), partnerKeySet: true,
    env: c.env, isActive: c.isActive,
  }
}

// GET /api/platform/payment-config — TapPay 信用卡 / LINE Pay（金鑰遮罩）
export async function GET(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const cfgs = await getPaymentConfigs()
  return NextResponse.json({
    credit: shape(cfgs.find(c => c.gateway === 'tappay_credit')),
    linepay: shape(cfgs.find(c => c.gateway === 'tappay_linepay')),
  })
}

// PATCH /api/platform/payment-config — 更新某 gateway（金鑰傳遮罩值代表沿用），或只切啟停
export async function PATCH(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const body = await req.json()
  const gateway: string = body.gateway
  if (gateway !== 'tappay_credit' && gateway !== 'tappay_linepay') {
    return NextResponse.json({ error: 'gateway 無效' }, { status: 400 })
  }

  // 只切前台啟停（不動金鑰）
  if (typeof body.isActive === 'boolean' && body.partnerKey === undefined) {
    await setPaymentConfigActive(gateway, body.isActive)
    return NextResponse.json({ ok: true })
  }

  const cur = await getPaymentConfig(gateway)
  let partnerKey: string = body.partnerKey ?? ''
  if (partnerKey.startsWith('****')) partnerKey = cur?.partnerKey ?? ''
  let appKey: string | undefined = body.appKey
  if (typeof appKey === 'string' && appKey.startsWith('****')) appKey = cur?.appKey ?? undefined
  if (!partnerKey || !body.merchantId) {
    return NextResponse.json({ error: 'partner key 與 merchant id 必填' }, { status: 400 })
  }

  await upsertPaymentConfig({
    gateway, partnerKey, merchantId: body.merchantId,
    env: body.env || 'sandbox', appId: body.appId, appKey,
  })
  return NextResponse.json({ ok: true })
}
