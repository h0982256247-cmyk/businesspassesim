import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { encryptEsimFields } from '@/lib/utils/esim-crypto'
import { notifyEsimReady } from '@/lib/services/notification'
import { recordAlert } from '@/lib/services/alert'
import { fetchEsimCodes, verifyRedeemedCredential } from '@/lib/services/esim'
import { OrderStatus } from '@prisma/client'

// 這支會同步呼叫世界移動 2.3 回查，預設 10 秒上限不夠 → 逾時會讓 WM 反覆重送
export const maxDuration = 60

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
//
// 安全性（P0-4）：這是公開端點、WM 未提供簽章。收到後會先用本地訂單存的 wmOrderId
// 向 WM 回查（2.3，帶簽章的 server→server 請求）：查得到就以回查值為準，查不到或對不上
// 就照 body 原樣寫入並記一筆 warn 告警——刻意不擋，因為擋下來的代價是「合法 callback
// 全被拒、訂單永遠沒有 QR」，且 COMPLETED 之後沒有任何自動補救路徑。
// 殘餘風險與取捨理由見 verifyRedeemedCredential 的註解。
// 寫入一律是條件式（esimQrcode / esimLpa 皆為 null），重播與並發都只有一則寫得進去。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null

  if (!body?.rcode) {
    return new NextResponse('1', { status: 200 })
  }

  // 透過 rcode 找回我們的訂單（3.2 callback 沒帶 orderId）。這只是本地索引，
  // 不構成驗真——真正的綁定在下面的回查。
  const order = await prisma.order.findFirst({
    where: { esimRcode: body.rcode as string },
    select: {
      id: true, userId: true, esimQrcode: true, esimLpa: true, status: true,
      esimRcode: true, wmOrderId: true, redeemedAt: true,
      // 通知要寄給「目前擁有者」：轉贈領取後買家已經看不到憑證，通知也不該寄給他
      currentOwnerId: true,
      orderItems: {
        select: {
          productName: true,
          product: { select: { countryNameZh: true, displayDays: true, dataCapacity: true } },
        },
      },
    },
  })
  if (!order) {
    console.warn('[wm-esim-redeemed/3.2] order not found for rcode', body.rcode)
    return new NextResponse('1', { status: 200 })
  }

  // 冪等：憑證已存在就不再覆寫（也不必回查）。要同時看 esimLpa——3.1 兌換回應若直接
  // 帶回 authoritative LPA，會出現「有 LPA 還沒有 QR」的狀態，此時更不能讓 webhook
  // 用自己的值把已驗證的 LPA 換掉。
  if (order.esimQrcode || order.esimLpa) {
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

  // 兌換是由我們主動呼叫 3.1 觸發的：沒有 wmOrderId 就無從回查驗真，沒有 redeemedAt
  // 代表我們根本還沒送出兌換（可能是亂序早到，也可能是偽造）。兩者都不寫入，
  // 回非 "1" 讓 WM 重送——真的是我們觸發的，下一次重送就會通過。
  if (!order.wmOrderId || !order.redeemedAt) {
    // 不記 rcode（憑證欄位嚴禁落 log，見 CLAUDE.md E 節）
    console.warn('[wm-esim-redeemed/3.2] 尚無 wmOrderId 或未觸發兌換，不寫入', {
      orderId: order.id, hasWmOrderId: !!order.wmOrderId, redeemed: !!order.redeemedAt,
    })
    return new NextResponse('0', { status: 503 })
  }

  // 回查：查得到就以 2.3 的值為準，查不到／對不上就照 callback 原樣採用（不擋流程）
  const supplier = await fetchEsimCodes(order.wmOrderId)
  const verified = verifyRedeemedCredential({
    signal: body,
    expectedRcode: order.esimRcode ?? '',
    supplier,
  })

  if (!verified.ok) {
    // 只記原因，不記憑證內容（QR/LPA/ICCID/PIN/PUK 嚴禁落 log）
    console.warn('[wm-esim-redeemed/3.2] 憑證驗真失敗，不寫入', { orderId: order.id, reason: verified.reason })
    await recordAlert('wm_redeemed_verify_failed', {
      orderId: order.id, reason: verified.reason, level: 'error',
    })
    return new NextResponse('0', { status: 503 })
  }
  if (verified.warning) {
    // 回查對不上但仍照 body 寫入 → 不阻斷交付，但要留下可查的紀錄
    await recordAlert('wm_redeemed_query_unverified', {
      orderId: order.id, reason: verified.warning, level: 'warn',
    })
  }

  // 條件式寫入：帶 esimQrcode / esimLpa 為 null，並發或重播的 callback 都只有一則寫得進去，
  // 也不可能置換掉已經存在的憑證。
  // 憑證欄位加密後才落地（單一來源見 lib/utils/esim-crypto）；
  // esimCfCode / esimApnExplain 非憑證，維持明文。
  const write = await prisma.order.updateMany({
    where: { id: order.id, esimQrcode: null, esimLpa: null },
    data: encryptEsimFields({ ...verified.credential }),
  })
  if (write.count !== 1) {
    // 併發下另一則已寫入 → 不重複推通知
    return new NextResponse('1', { status: 200 })
  }

  // 推 LINE 通知：QR 可以用了
  const item = order.orderItems[0]
  const productName = item?.productName ?? 'eSIM'
  const plan = item?.product
    ? { country: item.product.countryNameZh, days: item.product.displayDays, capacity: item.product.dataCapacity }
    : undefined
  // 收禮者才是能安裝這張卡的人（P0-5）；currentOwnerId 為歷史 NULL 時退回買家
  notifyEsimReady(order.currentOwnerId ?? order.userId, productName, plan).catch(() => {})

  return new NextResponse('1', { status: 200 })
}
