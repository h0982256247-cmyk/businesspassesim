import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus } from '@prisma/client'

// POST /api/webhooks/wm/esim-activated
// 世界移動「2.7 eSIM 激活通知」callback。設定方式：到 WM 後台 → 設定 → callback URL。
//
// Request body（WM 推送）：
//   {
//     orderId:  string  // WM 訂單編號（= 我們的 Order.wmOrderId）
//     rcode:    string  // 兌換碼（= 我們的 Order.esimRcode）
//     iccid:    string
//     useSDate: string  // unix timestamp (ms or s? 視 WM；目前看到 13 位 → ms)
//     useEDate: string
//   }
//
// 回傳：必須是純字串 "1"，否則 WM 會以 5 秒間隔 retry 3-4 次。
//
// 安全性：WM 未提供 callback 簽章機制。我們以 orderId + rcode 雙比對防偽：
//   兩個欄位必須同時對得到資料庫的同一筆 Order 才視為有效通知。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    | { orderId?: string; rcode?: string; iccid?: string; useSDate?: string; useEDate?: string }
    | null

  if (!body?.orderId || !body?.rcode) {
    // 仍回 "1" 避免 WM 一直 retry 我們無法處理的 payload
    return new NextResponse('1', { status: 200 })
  }

  // 用 wmOrderId + esimRcode 雙比對找出我們的訂單
  const order = await prisma.order.findFirst({
    where: { wmOrderId: body.orderId, esimRcode: body.rcode },
    select: {
      id: true, userId: true, currentOwnerId: true, activatedAt: true, status: true,
      gift: { select: { id: true, claimedAt: true, cancelledAt: true } },
    },
  })

  if (!order) {
    // 找不到對應訂單 → 可能是偽造或我們資料對不上；不寫入任何資料但回 "1" 避免 retry
    console.warn('[wm-activated] order not found for orderId+rcode', body.orderId)
    return new NextResponse('1', { status: 200 })
  }

  // 冪等：已激活過就不再更新（保留首次時間戳）
  if (order.activatedAt) {
    return new NextResponse('1', { status: 200 })
  }

  // 退款/取消守門：已 REFUNDED/CANCELLED 不在訂單上寫激活時間/動 gift（退款後仍處理）。
  if (order.status === OrderStatus.REFUNDED || order.status === OrderStatus.CANCELLED) {
    return new NextResponse('1', { status: 200 })
  }

  // 時間戳：WM 給的是毫秒 unix timestamp（看範例 13 位數）
  const useS = body.useSDate ? new Date(Number(body.useSDate)) : null
  const useE = body.useEDate ? new Date(Number(body.useEDate)) : null

  await prisma.$transaction(async tx => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        activatedAt: new Date(),
        ...(useS && !isNaN(useS.getTime()) ? { activationStart: useS } : {}),
        ...(useE && !isNaN(useE.getTime()) ? { activationEnd:   useE } : {}),
      },
    })

    // 若有 pending 未領取的 gift → 自動 cancel（買家已自用，不能再轉贈）
    if (order.gift?.id && !order.gift.claimedAt && !order.gift.cancelledAt) {
      await tx.orderGift.update({
        where: { id: order.gift.id },
        data: { cancelledAt: new Date(), cancelReason: 'esim_activated_by_buyer' },
      })
    }
  })

  return new NextResponse('1', { status: 200 })
}
