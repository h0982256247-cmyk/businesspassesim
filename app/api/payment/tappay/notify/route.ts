import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  markOrderPaid,
  markBundlePaid,
  markOrderFailed,
  markBundleFailed,
  markOrderRefunded,
  markBundleRefunded,
  markOrderCancelled,
  isOrderExpired,
} from '@/lib/services/order'
import { triggerEsimActivation } from '@/lib/services/esim'
import { notifyOrderPaid } from '@/lib/services/notification'
import { recordAlert } from '@/lib/services/alert'
import { fireAndLog } from '@/lib/utils/fire-and-log'
import {
  tapPayRefund,
  tapPayGatewayFor,
  verifyTapPayTransactionForOrder,
  verifyTapPayFailureForOrder,
} from '@/lib/services/tappay'
import { mapTapPayFailureReason } from '@/lib/services/tappay-failure-reason'
import { OrderStatus } from '@prisma/client'

// 驗真要打 TapPay Record API，成功後還要逐筆 await 供應商下單（bundle＝N 次外部呼叫）。
// 預設 10 秒上限會在「已寫入 supplierOrderClaimedAt、尚未拿到 wmOrderId」時把函式砍掉，
// 那批訂單會被自動重試與後台補發同時排除（見 P0-3），只能人工處理 → 比照付款路由拉到 60 秒。
export const maxDuration = 60

// POST /api/payment/tappay/notify
// TapPay webhook — fires for 3DS result and regular transactions
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ message: 'Bad request' }, { status: 400 })
  }

  const tapPayOrderId = body.order_number as string | undefined
  // 診斷：webhook 一進來就記，方便在 Vercel logs 確認 TapPay 到底有沒有打回來、
  // 以及卡在哪一關（找不到訂單 / 401 / 付款失敗 / 成功）。
  console.log('[tappay-notify] received', {
    order_number: tapPayOrderId,
    status: body.status,
    rec_trade_id: body.rec_trade_id,
  })

  if (!tapPayOrderId) return NextResponse.json({ message: 'Missing order_number' }, { status: 400 })

  const order = await prisma.order.findFirst({
    where: { tapPayOrderId },
    include: {
      orderItems: { take: 1 },
    },
  })

  if (!order) {
    console.warn('[tappay-notify] order NOT FOUND for order_number', tapPayOrderId)
    return NextResponse.json({ message: 'Order not found' }, { status: 404 })
  }

  // 真偽驗證不再靠 x-api-key header（實測 TapPay 的 backend_notify 不帶該 header，
  // 舊版用它比對 partner_key → 每筆合法通知都被 401 擋掉、訂單永遠卡 PROCESSING）。
  // 改在「確定要標記 PAID」前，用 rec_trade_id 向 TapPay Record API 回查驗真（見下）。

  // Idempotent: skip already-completed orders
  // REFUNDED 也要早退：晚到付款退款後 TapPay 仍可能重送同一筆 notify，若放行會
  // 走第二次退款、甚至在 provider 端狀態還沒反映退款時把訂單復活成 PAID。
  if (
    order.status === OrderStatus.PAID ||
    order.status === OrderStatus.COMPLETED ||
    order.status === OrderStatus.REFUNDED
  ) {
    return NextResponse.json({ message: 'Already processed' })
  }

  const status = body.status as number | undefined
  const recTradeId = (body.rec_trade_id as string | undefined) ?? ''

  // Bundle: TapPay only knows the anchor order_number; we fan out below.
  const bundleId = order.bundleId

  // 訂單已取消 或 建立時間超過 30 分鐘：若 TapPay 扣款成功立即退款
  const expired = isOrderExpired(order.createdAt)
  if (order.status === OrderStatus.CANCELLED || (expired && status === 0)) {
    if (status === 0 && recTradeId) {
      // For bundles, refund the full charged total (sum across the bundle).
      const refundAmount = bundleId
        ? (await prisma.order.aggregate({
            where: { bundleId },
            _sum: { totalPaid: true },
          }))._sum.totalPaid ?? order.totalPaid
        : order.totalPaid
      // 退款前必須先證明「這筆交易確實是這張訂單/這組 bundle 的成功付款」。少了這關，
      // 任何人都能用自己一張逾時訂單配上「別人交易的 rec_trade_id」，把別人的款退掉。
      // 同時擋掉 provider 端已退款/未成立的交易（不重複退款）。
      const verifyRefund = await verifyTapPayTransactionForOrder({
        recTradeId,
        orderNumber: order.tapPayOrderId ?? '',
        amount: refundAmount,
        paymentMethod: order.paymentMethod,
      })
      if (!verifyRefund.ok) {
        console.warn('[tappay-notify] 晚到付款驗真失敗，不退款、不改狀態', { order_number: tapPayOrderId, refundAmount, reason: verifyRefund.reason, ...verifyRefund.detail })
        await recordAlert('refund_verify_failed', {
          orderId: order.id,
          orderNumber: tapPayOrderId, refundAmount,
          reason: verifyRefund.reason, ...verifyRefund.detail,
        })
        return NextResponse.json({ message: 'Verification failed' }, { status: 400 })
      }
      // 打款前先原子佔位：TapPay 重送的兩則 notify 會同時通過上面的驗真（provider 端
      // 此刻仍是「已付款」），若直接打款就是對同一筆交易退兩次。用 tapPayRecTradeId
      // 從 NULL 改成這筆交易編號當作 claim——這條路徑的訂單是 CANCELLED / PROCESSING，
      // 依狀態機不可能已經寫過 recTradeId，所以搶到的那一個才是真正要退款的 worker。
      const refundClaim = await prisma.order.updateMany({
        where: { id: order.id, tapPayRecTradeId: null },
        data: { tapPayRecTradeId: recTradeId },
      })
      if (refundClaim.count !== 1) {
        console.warn('[tappay-notify] 退款已由其他流程處理或訂單已有交易紀錄，不重複退款', { order_number: tapPayOrderId })
        await recordAlert('refund_claim_conflict', {
          orderId: order.id, orderNumber: tapPayOrderId, refundAmount, level: 'warn',
        })
        return NextResponse.json({ message: 'Refund already in progress' })
      }
      // gateway 依訂單實際付款方式決定（信用卡／LINE Pay 是不同商店設定）
      const refund = await tapPayRefund(recTradeId, refundAmount, tapPayGatewayFor(order.paymentMethod))
      if (refund.ok) {
        if (bundleId) {
          await markBundleRefunded(bundleId)
        } else {
          await markOrderRefunded(order.id)
        }
        return NextResponse.json({ message: 'Order expired; payment refunded' })
      }
      // 驗真通過（款項確實入帳）但退款失敗：錢在我們這邊、使用者沒有卡。
      // 絕不可靜默標成 CANCELLED——狀態留著供對帳。
      // 注意 claim 刻意不釋放：tapPayRefund 的 ok:false 分不出「確定被拒」與「不知道成不成」，
      // 釋放後重送就可能退第二次（與 P0-3 的 unknown outcome 同一個取捨）。因此重送會停在
      // 上面的 refund_claim_conflict，這筆一律轉人工——refund_failed 是 error 級告警。
      console.error('[tappay-notify] 退款失敗，款項未退回', { order_number: tapPayOrderId, refundAmount, message: refund.message })
      await recordAlert('refund_failed', {
        orderId: order.id, orderNumber: tapPayOrderId, refundAmount,
        message: refund.message ?? null, level: 'error',
      })
      return NextResponse.json({ message: 'Refund failed' }, { status: 500 })
    }
    if (order.status !== OrderStatus.CANCELLED) await markOrderCancelled(order.id)
    return NextResponse.json({ message: 'Order expired; no action' })
  }

  if (status !== 0) {
    // 「付款失敗」同樣是 body 說了算的狀態變更：不驗真的話，任何知道 order_number 的人
    // 都能把他人進行中的訂單打成 FAILED。先向 Record API 證明這筆交易屬於這張訂單、
    // 且 provider 端確實不是成功狀態，才承認失敗。
    // 驗不出來就不動狀態——訂單留在 PROCESSING，由使用者端 /cancel 或 30 分鐘 cron 收尾，
    // 不會卡死；但絕不讓未驗真的 webhook 直接改狀態。
    const verifyFailed = await verifyTapPayFailureForOrder({
      recTradeId,
      orderNumber: order.tapPayOrderId ?? '',
      paymentMethod: order.paymentMethod,
    })
    if (!verifyFailed.ok) {
      console.warn('[tappay-notify] 失敗通知驗真失敗，不標記 FAILED', { order_number: tapPayOrderId, status, reason: verifyFailed.reason, ...verifyFailed.detail })
      await recordAlert('payment_failure_verify_failed', {
        orderId: order.id,
        orderNumber: tapPayOrderId, notifyStatus: status,
        reason: verifyFailed.reason, ...verifyFailed.detail,
      })
      return NextResponse.json({ message: 'Verification failed' }, { status: 400 })
    }
    // 把 TapPay 回傳的 status/msg 翻成中文存進 Order.failureReason，
    // 前端在訂單詳情頁顯示。LINE Pay 924 = 使用者主動取消，會顯示「您已取消付款」。
    const reason = mapTapPayFailureReason({
      status,
      msg: (body.msg as string | undefined) ?? null,
    })
    console.warn('[tappay-notify] payment FAILED', { order_number: tapPayOrderId, status, reason })
    if (bundleId) {
      await markBundleFailed(bundleId, reason)
    } else {
      const failed = await markOrderFailed(order.id, reason)
      // 亂序抵達：這筆失敗通知比已確認的成功結果舊。狀態機已擋下（不會把 PAID
      // 打回 FAILED），但這代表 provider 端有兩則相反結果，值得人工看一眼。
      if (!failed.ok && failed.result === 'invalid') {
        await recordAlert('payment_failure_transition_conflict', {
          orderId: order.id, orderNumber: tapPayOrderId, notifyStatus: status,
          currentStatus: failed.current, level: 'error',
        })
      }
    }
    return NextResponse.json({ message: 'Payment failed' })
  }

  // ── 驗真：用 rec_trade_id 向 TapPay Record API 回查，確認這筆交易「確實是這張訂單
  //    的付款」才放行標記 PAID（防偽造 notify 騙開卡、防拿別張訂單的合法交易冒名頂替）。
  //    期望值一律取 DB 的 server-side 值，不用 webhook body。失敗則不標記、回 400。 ──
  const expectedAmount = bundleId
    ? ((await prisma.order.aggregate({ where: { bundleId }, _sum: { totalPaid: true } }))._sum.totalPaid ?? order.totalPaid)
    : order.totalPaid
  const verify = await verifyTapPayTransactionForOrder({
    recTradeId,
    orderNumber: order.tapPayOrderId ?? '',
    amount: expectedAmount,
    paymentMethod: order.paymentMethod,
  })
  if (!verify.ok) {
    // 只印純量：Record API 原始交易紀錄帶持卡人 PII / 卡片資訊，不可落地 log
    console.warn('[tappay-notify] Record API 驗真失敗，不標記 PAID', { order_number: tapPayOrderId, expectedAmount, reason: verify.reason, ...verify.detail })
    await recordAlert('payment_verify_failed', {
      orderId: order.id,
      orderNumber: tapPayOrderId, expectedAmount,
      reason: verify.reason, ...verify.detail,
    })
    return NextResponse.json({ message: 'Verification failed' }, { status: 400 })
  }

  // Mark paid — fan out across the bundle if applicable.
  let paidOrderIds: string[]
  // 發卡國別（信用卡才有；LINE Pay 為 undefined）→ 存進訂單供後台手續費 國內2.2%/國外2.8% 判斷
  if (bundleId) {
    // 只拿真的處在 PAID 的訂單：被單張退款／逾時取消的 sibling 不會被帶進發卡流程
    const { orders: paidOrders, changed } = await markBundlePaid(bundleId, recTradeId, verify.cardCountry)
    // changed===0 且已有 PAID 訂單 ＝ 同一則通知的另一個 worker 先完成了轉移，
    // 發卡與通知由它負責（與單筆的 already 早退同語意），這裡不重複扇出。
    if (changed === 0 && paidOrders.length > 0) {
      return NextResponse.json({ message: 'Already processed' })
    }
    paidOrderIds = paidOrders.map(o => o.id)
  } else {
    const paid = await markOrderPaid(order.id, recTradeId, verify.cardCountry)
    // already ＝ 同一則通知被並發處理，另一個 worker 已標記並負責後續發卡／通知，
    // 這裡直接當成已處理返回（與最上方的冪等早退同語意），不重複扇出。
    if (!paid.ok && paid.result === 'already') {
      return NextResponse.json({ message: 'Already processed' })
    }
    paidOrderIds = paid.ok ? [order.id] : []
  }
  if (paidOrderIds.length === 0) {
    // 款項已回查驗真（確實入帳），但訂單期間已被退款／取消 → 狀態不可蓋回 PAID，
    // 也不可繼續發卡。款項是否退回需人工判斷，這裡記告警轉對帳，不回 500
    // （不是系統故障，重送也不會有不同結果）。
    console.warn('[tappay-notify] 驗真通過但訂單已不可轉 PAID，不發卡', { order_number: tapPayOrderId })
    await recordAlert('order_paid_transition_conflict', {
      orderId: order.id, bundleId, orderNumber: tapPayOrderId, recTradeId,
      statusBeforeNotify: order.status, level: 'error',
    })
    return NextResponse.json({ message: 'Order no longer payable' }, { status: 409 })
  }
  console.log('[tappay-notify] marked PAID ✅', { order_number: tapPayOrderId, paidOrderIds })

  // 記憶卡號：card_secret 只在 pay-by-prime「第一段回應」出現、backend_notify 不帶，
  // 故存卡已移到扣款路由 /api/payment/tappay（拿到 charge 回應時）。此處不再處理。

  for (const oid of paidOrderIds) {
    // 開卡必須在 webhook 回 200「之前」await 完成：Vercel serverless 在回應後會凍結/
    // 終止函式，未 await 的背景工作（fire-and-forget）可能根本沒跑完。X6S4GW 即如此
    // ——付款成功卻完全沒有 placeWmOrder 紀錄。
    try {
      await triggerEsimActivation(oid)
    } catch (e) {
      console.error('[pay-notify] triggerEsimActivation failed', oid, e)
      await recordAlert('esim_activation_failed', { orderId: oid, error: e instanceof Error ? e.message : String(e) })
    }
  }

  if (bundleId && paidOrderIds.length > 1) {
    // 整捆：列出整組所有方案 + 加總金額
    const [totalAggregate, bundleItems] = await Promise.all([
      prisma.order.aggregate({ where: { bundleId }, _sum: { totalPaid: true } }),
      prisma.orderItem.findMany({ where: { order: { bundleId } }, select: { productName: true, qty: true } }),
    ])
    fireAndLog('notify_order_paid_failed', order.id, notifyOrderPaid(
      order.userId,
      bundleItems,
      totalAggregate._sum.totalPaid ?? order.totalPaid,
    ))
  } else {
    const items = order.orderItems.map(it => ({ productName: it.productName, qty: it.qty }))
    fireAndLog('notify_order_paid_failed', order.id, notifyOrderPaid(order.userId, items, order.totalPaid))
  }

  return NextResponse.json({ message: 'ok' })
}
