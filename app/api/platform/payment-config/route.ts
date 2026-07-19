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

// TapPay 資料模型：底層仍是兩筆 gateway（tappay_credit / tappay_linepay），
// 但 Partner Key / App ID / App Key / 環境 兩者共用（只填一次），僅 Merchant ID
// 與前台啟用各自獨立。本 API 對前台呈現「一份 TapPay 設定」。

// GET /api/platform/payment-config — 回統一結構（金鑰遮罩）
export async function GET(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const cfgs = await getPaymentConfigs()
  const credit = cfgs.find(c => c.gateway === 'tappay_credit')
  const linepay = cfgs.find(c => c.gateway === 'tappay_linepay')
  const shared = credit ?? linepay   // 共用欄位取任一存在者
  return NextResponse.json({
    partnerKey: shared ? maskSecret(shared.partnerKey) : '',
    partnerKeySet: !!shared,
    appId: shared?.appId ?? '',
    appKey: shared?.appKey ? maskSecret(shared.appKey) : '',
    appKeySet: !!shared?.appKey,
    env: shared?.env ?? 'sandbox',
    credit: { merchantId: credit?.merchantId ?? '', isActive: credit?.isActive ?? true },
    linePay: { merchantId: linepay?.merchantId ?? '', isActive: linepay?.isActive ?? true },
  })
}

// PATCH /api/platform/payment-config — 統一儲存（共用金鑰寫入兩個 gateway；金鑰傳遮罩＝沿用）
export async function PATCH(req: NextRequest) {
  const a = await guard(req)
  if (a instanceof NextResponse) return a
  const body = await req.json()

  // 共用金鑰／App 設定的「遮罩沿用」基準：取現有任一 gateway 的解密值
  const cur = await getPaymentConfig('tappay_credit')
  const curLine = await getPaymentConfig('tappay_linepay')
  const existingPartner = cur?.partnerKey ?? curLine?.partnerKey ?? ''
  const existingAppKey = cur?.appKey ?? curLine?.appKey ?? undefined

  let partnerKey: string = body.partnerKey ?? ''
  if (partnerKey.startsWith('****')) partnerKey = existingPartner
  let appKey: string | undefined = body.appKey
  if (typeof appKey === 'string' && appKey.startsWith('****')) appKey = existingAppKey
  const appId: string | undefined = body.appId || undefined
  const env: string = body.env === 'production' ? 'production' : 'sandbox'
  const creditMerchantId: string = (body.creditMerchantId ?? '').trim()
  const linePayMerchantId: string = (body.linePayMerchantId ?? '').trim()
  const creditActive: boolean = body.creditActive !== false      // 預設啟用
  const linePayActive: boolean = body.linePayActive !== false

  if (!partnerKey) return NextResponse.json({ error: 'Partner Key 必填' }, { status: 400 })
  if (creditActive && !creditMerchantId) {
    return NextResponse.json({ error: '信用卡已啟用，請填信用卡 Merchant ID' }, { status: 400 })
  }
  if (linePayActive && !linePayMerchantId) {
    return NextResponse.json({ error: 'LINE Pay 已啟用，請填 LINE Pay Merchant ID' }, { status: 400 })
  }

  // 共用 partnerKey / appId / appKey / env 寫進兩個 gateway；Merchant ID 各自
  // （upsertPaymentConfig 內含「換 Partner Key 清綁卡」的防呆，只在 credit gateway 觸發）
  await upsertPaymentConfig({ gateway: 'tappay_credit', partnerKey, merchantId: creditMerchantId, env, appId, appKey })
  await upsertPaymentConfig({ gateway: 'tappay_linepay', partnerKey, merchantId: linePayMerchantId, env, appId, appKey })
  await setPaymentConfigActive('tappay_credit', creditActive)
  await setPaymentConfigActive('tappay_linepay', linePayActive)

  return NextResponse.json({ ok: true })
}
