import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { fetchEsimCodes } from '@/lib/services/esim'
import { markOrderCompleted } from '@/lib/services/order'
import { OrderStatus } from '@prisma/client'

// POST /api/webhooks/wm/esim-ordered
// 世界移動「2.2 eSIM 下單 callback（systemMail=false 時）」
// WM 後台設定路徑：設定 → eSIM下單 API Callback URL
//
// Request body：
//   {
//     orderId:   string    // WM 訂單編號（= 我們的 Order.wmOrderId）
//     orderSN:   string    // eSIM mail 單號
//     orderTime: string    // 訂單信時間
//     code:      int
//     msg:       string
//     itemList:  [{
//       iccid:           string
//       productName:     string
//       redemptionCode:  string    // ← 兌換碼（我們存到 esimRcode）
//       wmproductId:     string
//       productPrice:    int
//     }]
//   }
//
// 我們只拿到 rcode + iccid，QR/LPA 還沒生（要等用戶按「我要安裝」觸發 3.1）
// 回傳：必須是字串 "1"
//
// 安全性：WM 未提供 callback 簽章機制，且本 callback 的 rcode 就在 body 裡（無法像
// 2.7 那樣做 orderId + rcode 雙欄位比對）。因此 body 一律只當「觸發訊號」，實際落地
// 的兌換碼改以 2.3 訂單查詢回查為準（帶 SHA1 簽章的 server→server 請求）——與
// TapPay notify 用 Record API 驗真同一套路。偽造的 callback 因回查對不到資料而寫不進東西。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    | { orderId?: string; orderSN?: string; orderTime?: string; code?: number; itemList?: Array<Record<string, unknown>> }
    | null

  if (!body?.orderId || !body.itemList?.[0]) {
    return new NextResponse('1', { status: 200 })
  }

  const order = await prisma.order.findFirst({
    where: { wmOrderId: body.orderId },
    select: { id: true, esimRcode: true, status: true },
  })
  if (!order) {
    console.warn('[wm-esim-ordered/2.2] order not found for wmOrderId', body.orderId)
    return new NextResponse('1', { status: 200 })
  }

  // 冪等：已收到過 callback（esimRcode 非空）就不再覆寫
  if (order.esimRcode) {
    return new NextResponse('1', { status: 200 })
  }

  // 退款/取消守門：已 REFUNDED/CANCELLED 的訂單不可被晚到的 callback 復活成 COMPLETED
  // （否則造成「退款後發卡」）。回 "1" 讓 WM 不再 retry，但不覆蓋狀態、不寫兌換碼。
  if (order.status === OrderStatus.REFUNDED || order.status === OrderStatus.CANCELLED) {
    return new NextResponse('1', { status: 200 })
  }

  // 2.2 callback 的 code 表示下單結果；非 0 表示失敗
  if (body.code != null && body.code !== 0) {
    console.warn('[wm-esim-ordered/2.2] non-success code', body.orderId, body.code)
    return new NextResponse('1', { status: 200 })
  }

  // 回查驗真：不採信 body.itemList，改向 WM 查該筆訂單真正的兌換碼（見檔頭安全性說明）
  const verified = await fetchEsimCodes(body.orderId)
  if (!verified?.esimRcode) {
    // 回查失敗／查無兌換碼：可能是偽造的 callback，也可能是 WM 查詢 API 暫時異常或
    // 尚未同步（後者 fetchEsimCodes 內已記 wm_query_failed / wm_query_exception 告警）。
    // 一律不寫入。此處刻意「不回 '1'」以觸發 WM 每 5 秒、共 3-4 次的重送，讓短暫
    // 異常能在同一條流程內自行恢復——偽造的 callback 重送幾次仍過不了回查，無副作用。
    console.warn('[wm-esim-ordered/2.2] 回查驗真失敗，不寫入兌換碼', body.orderId)
    return new NextResponse('0', { status: 503 })
  }

  // 注意：此階段尚無 QR/LPA，要等用戶按「我要安裝」觸發 3.1 之後 3.2 callback 才有
  await markOrderCompleted(order.id, verified)

  return new NextResponse('1', { status: 200 })
}
