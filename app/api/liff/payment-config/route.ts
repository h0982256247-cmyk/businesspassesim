import { NextResponse } from 'next/server'
import { getPaymentConfig } from '@/lib/services/tenant-config'

// GET /api/liff/payment-config
// 回傳 TapPay 前端 SDK 設定（單一品牌，全域金流設定）。
// 信用卡 / LINE Pay 共用同一個 TapPay App（appId/appKey），SDK 設定取任一可用者。
export async function GET() {
  const [credit, linepay] = await Promise.all([
    getPaymentConfig('tappay_credit'),
    getPaymentConfig('tappay_linepay'),
  ])
  // 前台是否顯示各支付：需「已設定金鑰」且「啟用開關開啟」。
  const methods = {
    creditCard: !!(credit?.isActive && credit?.appId && credit?.appKey),
    linePay:    !!(linepay?.isActive && (linepay?.appId || credit?.appId) && (linepay?.appKey || credit?.appKey)),
  }
  const sdk = (credit?.appId && credit?.appKey) ? credit : (linepay?.appId && linepay?.appKey ? linepay : null)
  if (sdk?.appId && sdk?.appKey) {
    return NextResponse.json({
      appId: parseInt(sdk.appId),
      appKey: sdk.appKey,
      env: sdk.env === 'production' ? 'production' : 'sandbox',
      methods,
    })
  }

  // Fallback：env（本地開發用；預設兩種支付都顯示）
  return NextResponse.json({
    appId: parseInt(process.env.NEXT_PUBLIC_TAPPAY_APP_ID ?? '0'),
    appKey: process.env.NEXT_PUBLIC_TAPPAY_APP_KEY ?? '',
    env: process.env.NEXT_PUBLIC_TAPPAY_ENV === 'production' ? 'production' : 'sandbox',
    methods: { creditCard: true, linePay: true },
  })
}
