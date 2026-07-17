import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { notifyEsimReady } from '@/lib/services/notification'
import { OrderStatus } from '@prisma/client'

// POST /api/webhooks/wm/esim-redeemed
// 世界移動「3.2 兌換兌換碼 callback」
// WM 後台設定路徑：設定 → 兌換 API Callback URL
//
// Request body：
//   {
//     qrcode:         string   // 圖片 URL（qrcodeType=0 或 2 時）或文字（=1）
//     rcode:          string   // 兌換碼（用來定位是哪張卡）
//     qrcodeType:     int
//     resultcode:     "000"=success
//     resultmsg:      string
//     code:           int
//     msg:            string
//     iccid:          string
//     qrcodeContent:  string   // LPA 字串（iOS 17.4+ 一鍵安裝必要）
//     salePlanDays:   int
//     pin1, pin2, puk1, puk2, cfCode, apnExplain: string?
//   }
//
// 回傳：必須是字串 "1"
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null

  if (!body?.rcode) {
    return new NextResponse('1', { status: 200 })
  }

  // 透過 rcode 找回我們的訂單（3.2 callback 沒帶 orderId）
  const order = await prisma.order.findFirst({
    where: { esimRcode: body.rcode as string },
    select: {
      id: true, userId: true, esimQrcode: true, status: true,
      orderItems: {
        select: {
          productName: true,
          product: { select: { countryNameZh: true, displayDays: true, dataCapacity: true } },
        },
      },
      user: {
        select: {
          tenantAdminId: true,
          groupMembership: { select: { group: { select: { tenantAdminId: true } } } },
          ownedGroup: { select: { tenantAdminId: true } },
        },
      },
    },
  })
  if (!order) {
    console.warn('[wm-esim-redeemed/3.2] order not found for rcode', body.rcode)
    return new NextResponse('1', { status: 200 })
  }

  // 冪等：已寫過 QR 就不再覆寫
  if (order.esimQrcode) {
    return new NextResponse('1', { status: 200 })
  }

  // 退款/取消守門：已 REFUNDED/CANCELLED 不可再寫 QR、推「可安裝」通知（退款後發卡）。
  if (order.status === OrderStatus.REFUNDED || order.status === OrderStatus.CANCELLED) {
    return new NextResponse('1', { status: 200 })
  }

  const resultcode = String(body.resultcode ?? '')
  if (resultcode !== '000') {
    console.warn('[wm-esim-redeemed/3.2] redemption failed', body.rcode, body.resultmsg)
    return new NextResponse('1', { status: 200 })
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      esimQrcode:     body.qrcode        as string | undefined,
      esimLpa:        body.qrcodeContent as string | undefined,
      esimIccid:      body.iccid         as string | undefined,
      esimPin1:       body.pin1          as string | undefined,
      esimPin2:       body.pin2          as string | undefined,
      esimPuk1:       body.puk1          as string | undefined,
      esimPuk2:       body.puk2          as string | undefined,
      esimCfCode:     body.cfCode        as string | undefined,
      esimApnExplain: body.apnExplain    as string | undefined,
    },
  })

  // 推 LINE 通知：QR 可以用了（用該訂單所屬租戶的 LINE OA）
  const item = order.orderItems[0]
  const productName = item?.productName ?? 'eSIM'
  const tenantAdminId = order.user?.tenantAdminId
    ?? order.user?.groupMembership?.group?.tenantAdminId
    ?? order.user?.ownedGroup?.tenantAdminId
    ?? null
  const plan = item?.product
    ? { country: item.product.countryNameZh, days: item.product.displayDays, capacity: item.product.dataCapacity }
    : undefined
  notifyEsimReady(order.userId, productName, tenantAdminId, plan).catch(() => {})

  return new NextResponse('1', { status: 200 })
}
