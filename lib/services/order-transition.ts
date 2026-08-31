import { OrderStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// ─── Order 狀態機：合法轉移的單一來源（P0-6）─────────────────────────
//
// 這張表只回答一個問題：「要把訂單寫成 X 狀態時，它目前允許是哪些狀態？」
//
// 為什麼要有這一層：狀態變更散在六個入口（同步付款、TapPay notify、WM 2.2
// callback、逾時 cron、eSIM 重試 cron、後台退款／補發），過去多半是
//   SELECT status → 在程式裡判斷 → UPDATE by id
// 這是 read-then-act 不是鎖：中間隔著一次供應商 API 呼叫（數百毫秒到數秒），
// 舊 worker／重送的 webhook／cron 只要在這個窗口內完成寫入，後手的 blind
// update 就會把較新的終態覆蓋回較舊的狀態（退款後又變 COMPLETED、已付款被
// 標成 FAILED）。改成「合法性判斷與寫入在同一句 SQL 裡」＝ compare-and-set，
// 條件不成立就一列都不動。
//
// 決定這張表長相的業務事實（依現行程式碼，不是理想設計）：
//  - REFUNDED 位階最高：只有「供應商端真的退款成功」之後才會寫入，因此可以從
//    任何狀態進入（含 CANCELLED／FAILED——逾時取消後晚到的付款退款走的就是這條）。
//  - FAILED 對「付款以外」是終態：不可被 CANCELLED／COMPLETED 覆蓋。但
//    FAILED → PAID 保留：notify 走到標記 PAID 之前一定先過 Record API 回查驗真
//    （見 verifyTapPayTransactionForOrder），provider 說扣款成功就是事實，
//    把它擋在 FAILED 會讓「已扣款卻永遠拿不到卡」無法自動修正。
//    現行 UI 的「付款失敗」只給「重新選購」（開新單），沒有原地重付，
//    故不需要 FAILED → PROCESSING。
//  - PAID／COMPLETED 不可退回 PROCESSING／FAILED／CANCELLED。
//  - ESIM_PENDING 目前沒有任何寫入者（placeWmOrder 失敗改為維持 PAID），
//    僅存量歷史資料仍是這個狀態，故保留它為 COMPLETED／REFUNDED 的合法前狀態。
//  - PENDING 只由 createOrder／createBundleOrders 建立，沒有任何轉移進得去。
const ALLOWED_FROM: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]:      [],
  [OrderStatus.PROCESSING]:   [OrderStatus.PENDING],
  [OrderStatus.PAID]:         [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.FAILED],
  [OrderStatus.ESIM_PENDING]: [OrderStatus.PAID],
  [OrderStatus.COMPLETED]:    [OrderStatus.PAID, OrderStatus.ESIM_PENDING],
  [OrderStatus.FAILED]:       [OrderStatus.PENDING, OrderStatus.PROCESSING],
  [OrderStatus.CANCELLED]:    [OrderStatus.PENDING, OrderStatus.PROCESSING],
  [OrderStatus.REFUNDED]: [
    OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.PAID,
    OrderStatus.ESIM_PENDING, OrderStatus.COMPLETED, OrderStatus.FAILED, OrderStatus.CANCELLED,
  ],
}

/** 寫入目標狀態時，允許的「目前狀態」清單。批次更新（bundle／cron）自組 where 用。 */
export function allowedFromFor(to: OrderStatus): OrderStatus[] {
  return [...ALLOWED_FROM[to]]
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_FROM[to].includes(from)
}

// 轉移沒成功的四種語意。呼叫端必須分得出來——全部當成 500 會讓正常的並發
// （重送的 webhook、兩個 cron 撞在一起）看起來像系統故障：
//   already   已經在目標狀態 → 冪等，重送／重試的正常結果，不是錯誤
//   invalid   目前狀態不允許轉到目標狀態 → 通常是終態保護生效（退款後想發卡）
//   conflict  目前狀態「本來應該可以」轉 → CAS 與回讀之間又被改動，純併發
//   not_found 訂單不存在
export type TransitionFailure = 'already' | 'invalid' | 'conflict' | 'not_found'

export type TransitionResult =
  | { ok: true; to: OrderStatus }
  | { ok: false; result: TransitionFailure; to: OrderStatus; current: OrderStatus | null }

/**
 * 條件式狀態轉移（compare-and-set）。
 *
 *   UPDATE "orders" SET status = <to>, ...data
 *    WHERE id = <orderId> AND status IN (<allowed previous states>)
 *
 * count === 1 才算轉移成功；count === 0 代表已被其他 worker 改過、已是終態、
 * 或這個轉移本來就不合法——三者都不可以再蓋回去。data 會與狀態在同一句寫入，
 * 避免「狀態擋下來了、附帶欄位卻仍然寫進去」。
 */
export async function transitionOrderStatus(
  orderId: string,
  to: OrderStatus,
  data: Prisma.OrderUpdateManyMutationInput = {},
): Promise<TransitionResult> {
  const from = ALLOWED_FROM[to]
  if (from.length > 0) {
    const r = await prisma.order.updateMany({
      where: { id: orderId, status: { in: [...from] } },
      // status 放最後：呼叫端傳進來的 data 不可能覆蓋掉目標狀態
      data: { ...data, status: to },
    })
    if (r.count === 1) return { ok: true, to }
  }

  // 沒改到 → 回讀目前狀態，把「冪等」「終態保護」「純併發」分開回報
  const current = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } })
  if (!current) return { ok: false, result: 'not_found', to, current: null }

  const result: TransitionFailure =
    current.status === to ? 'already'
    : from.includes(current.status) ? 'conflict'
    : 'invalid'

  // already 是正常結果，不吵；invalid／conflict 要看得見（訂單 id 不是機敏資料）
  if (result !== 'already') {
    console.warn('[order-transition] 轉移被拒', { orderId, from: current.status, to, result })
  }
  return { ok: false, result, to, current: current.status }
}
