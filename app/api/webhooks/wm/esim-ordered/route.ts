import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
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

  const item = body.itemList[0]
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status:        OrderStatus.COMPLETED,
      esimRcode:     item.redemptionCode as string | undefined,
      esimIccid:     item.iccid          as string | undefined,
      wmOrderSn:     body.orderSN,
      wmOrderTime:   body.orderTime,
      // 注意：此階段尚無 QR/LPA，要等用戶按「我要安裝」觸發 3.1 之後 3.2 callback 才有
    },
  })

  return new NextResponse('1', { status: 200 })
}
