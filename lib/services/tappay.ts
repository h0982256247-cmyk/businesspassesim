// TapPay Pay by Prime / Pay by Token API

// 金鑰一律經 tenant-config service 解密讀取（單一來源，route/service 不各寫一套）
import { getPaymentConfig } from '@/lib/services/tenant-config'
import type { PaymentMethod } from '@prisma/client'

export interface TapPayChargeInput {
  prime: string
  orderId: string
  amount: number
  details: string
  cardholder: {
    phone_number: string
    name: string
    email: string
  }
  remember?: boolean
  resultUrl?: {
    frontendRedirectUrl: string
    backendNotifyUrl: string
  }
}

export interface TapPayTokenChargeInput {
  cardKey: string
  cardToken: string
  orderId: string
  amount: number
  details: string
  cardholder: {
    phone_number: string
    name: string
    email: string
  }
  resultUrl?: {
    frontendRedirectUrl: string
    backendNotifyUrl: string
  }
}

export type TapPayChargeResult =
  | {
      ok: true
      recTradeId: string
      bankTransactionId: string
      paymentUrl?: string
      // 記憶卡號：remember=true 時，TapPay 在 pay-by-prime「第一段回應」回 card_secret，
      // 須在扣款路由存起來（backend_notify 不帶這個）。
      cardSecret?: { cardKey: string; cardToken: string }
      cardInfo?: { lastFour?: string; type?: number; funding?: number; expiryDate?: string; country?: string }
    }
  | { ok: false; message: string }

// 第一段（pay-by-prime / pay-by-token）同步回應失敗時，TapPay 的 msg 多為英文。
// 依使用者要求，前端需顯示「中文失敗原因」彈窗，故在此把回應轉成中文：
// 先用 status 對應常見錯誤碼，再用英文 msg 關鍵字補強，最後給出通用中文訊息，
// 並一律附上原始代碼（與英文 msg）方便客服／後台對帳查詢。
const TAPPAY_STATUS_MESSAGES: Record<number, string> = {
  2: '發卡銀行拒絕此筆交易，請聯絡發卡銀行或改用其他卡片',
  10003: '付款資料不完整，請重新整理頁面後再試一次',
  10009: '系統忙碌中，請稍後再試一次',
}

export function tapPayErrorMessage(status: number, msg?: string): string {
  if (status === 0) return ''

  // 1) 已知的 status 錯誤碼
  const byStatus = TAPPAY_STATUS_MESSAGES[status]
  if (byStatus) return `${byStatus}（代碼 ${status}）`

  // 2) 用英文 msg 關鍵字判斷常見刷卡失敗原因（不依賴完整錯誤碼表，較穩定）
  const lower = (msg ?? '').toLowerCase()
  let reason = ''
  if (/expire/.test(lower)) reason = '信用卡已過期，請改用其他卡片'
  else if (/insufficient|not enough|exceed|limit/.test(lower)) reason = '信用卡額度或餘額不足，請改用其他卡片'
  else if (/declin|reject|deny|denied|risk|fraud|blacklist/.test(lower)) reason = '發卡銀行拒絕此筆交易，請聯絡發卡銀行或改用其他卡片'
  else if (/cvc|cvv|security code/.test(lower)) reason = '卡片背面末三碼有誤，請確認後再試一次'
  else if (/invalid card|card number|card_number|wrong card/.test(lower)) reason = '卡號或卡片資訊有誤，請確認後再試一次'
  else if (/3d|otp|secure|authenticat/.test(lower)) reason = '3D 驗證失敗，請重新進行驗證或改用其他卡片'

  if (reason) return `${reason}（代碼 ${status}）`

  // 3) 通用中文訊息（保留原始代碼與 msg 以利查詢）
  const tail = msg ? `（代碼 ${status}：${msg}）` : `（代碼 ${status}）`
  return `信用卡交易失敗，請確認卡片資訊或改用其他卡片後再試一次${tail}`
}

async function getConfig(gateway: string = 'tappay_credit') {
  // 單一品牌：金流設定取自全域 PaymentConfig（by gateway），未設定退回 env（開發用）。
  const cfg = await getPaymentConfig(gateway)  // partnerKey 已解密
  if (cfg && cfg.isActive) {
    return {
      partnerKey: cfg.partnerKey,
      merchantId: cfg.merchantId,
      baseUrl: cfg.env === 'production'
        ? 'https://prod.tappaysdk.com/tpc'
        : 'https://sandbox.tappaysdk.com/tpc',
    }
  }

  const partnerKey = process.env.TAPPAY_PARTNER_KEY
  // LINE Pay 在 TapPay 後台通常是獨立的 merchant_id；未設定時退回信用卡用的 merchant_id
  const merchantId = gateway === 'tappay_linepay'
    ? (process.env.TAPPAY_LINEPAY_MERCHANT_ID ?? process.env.TAPPAY_MERCHANT_ID)
    : process.env.TAPPAY_MERCHANT_ID
  const env = process.env.TAPPAY_ENV === 'production' ? 'production' : 'sandbox'

  if (!partnerKey || !merchantId) throw new Error('TapPay credentials not set')

  const baseUrl = env === 'production'
    ? 'https://prod.tappaysdk.com/tpc'
    : 'https://sandbox.tappaysdk.com/tpc'

  return { partnerKey, merchantId, baseUrl }
}

// TapPay Pay by Prime 對 3DS 的正確 body 結構（官方 doc）：
//   three_domain_secure: true        ← TOP-LEVEL boolean
//   result_url: { frontend..., backend... }  ← TOP-LEVEL object
// 過去寫成 nested three_domain_secure.{enabled, result_url} 是錯的，TapPay 回
// 代碼 5「Wrong JSON format」，使用者看到「信用卡交易失敗」但其實是我們 body
// 結構不對。https://docs.tappaysdk.com/tutorial/zh/back.html
// export 出去讓 tests/tappay-3ds-body.test.ts 鎖死結構，避免下次又改回 nested。
export function build3dsBlock(resultUrl: TapPayChargeInput['resultUrl']) {
  if (!resultUrl) return {}
  return {
    three_domain_secure: true,
    result_url: {
      frontend_redirect_url: resultUrl.frontendRedirectUrl,
      backend_notify_url: resultUrl.backendNotifyUrl,
    },
  }
}

export async function tapPayCharge(input: TapPayChargeInput): Promise<TapPayChargeResult> {
  const { partnerKey, merchantId, baseUrl } = await getConfig('tappay_credit')

  const body = {
    prime: input.prime,
    partner_key: partnerKey,
    merchant_id: merchantId,
    details: input.details,
    amount: input.amount,
    currency: 'TWD',
    order_number: input.orderId,
    cardholder: input.cardholder,
    remember: input.remember ?? false,
    ...build3dsBlock(input.resultUrl),
  }

  const res = await fetch(`${baseUrl}/payment/pay-by-prime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': partnerKey,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (data.status !== 0) {
    return { ok: false, message: tapPayErrorMessage(data.status, data.msg) }
  }

  // 記憶卡號：remember=true 時這裡會有 card_secret / card_info（只在第一段回應）
  const cs = data.card_secret as { card_key?: string; card_token?: string } | undefined
  const ci = data.card_info as { last_four?: string; type?: number; funding?: number; expiry_date?: string; country_code?: string; country?: string } | undefined

  return {
    ok: true,
    recTradeId: data.rec_trade_id ?? '',
    bankTransactionId: data.bank_transaction_id ?? '',
    ...(data.payment_url ? { paymentUrl: data.payment_url as string } : {}),
    ...(cs?.card_key && cs?.card_token ? { cardSecret: { cardKey: cs.card_key, cardToken: cs.card_token } } : {}),
    ...(ci ? { cardInfo: { lastFour: ci.last_four, type: ci.type, funding: ci.funding, expiryDate: ci.expiry_date, country: ci.country_code ?? ci.country } } : {}),
  }
}

export async function tapPayChargeByToken(input: TapPayTokenChargeInput): Promise<TapPayChargeResult> {
  const { partnerKey, merchantId, baseUrl } = await getConfig('tappay_credit')

  const body = {
    card_key: input.cardKey,
    card_token: input.cardToken,
    partner_key: partnerKey,
    merchant_id: merchantId,
    details: input.details,
    amount: input.amount,
    order_number: input.orderId,
    cardholder: input.cardholder,
    currency: 'TWD',
    ...build3dsBlock(input.resultUrl),
  }

  const res = await fetch(`${baseUrl}/payment/pay-by-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': partnerKey,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (data.status !== 0) {
    return { ok: false, message: tapPayErrorMessage(data.status, data.msg) }
  }

  // 記憶卡號：remember=true 時這裡會有 card_secret / card_info（只在第一段回應）
  const cs = data.card_secret as { card_key?: string; card_token?: string } | undefined
  const ci = data.card_info as { last_four?: string; type?: number; funding?: number; expiry_date?: string; country_code?: string; country?: string } | undefined

  return {
    ok: true,
    recTradeId: data.rec_trade_id ?? '',
    bankTransactionId: data.bank_transaction_id ?? '',
    ...(data.payment_url ? { paymentUrl: data.payment_url as string } : {}),
    ...(cs?.card_key && cs?.card_token ? { cardSecret: { cardKey: cs.card_key, cardToken: cs.card_token } } : {}),
    ...(ci ? { cardInfo: { lastFour: ci.last_four, type: ci.type, funding: ci.funding, expiryDate: ci.expiry_date, country: ci.country_code ?? ci.country } } : {}),
  }
}

// ─── Record API：用 rec_trade_id 回查交易真偽 ───────────────────────
// TapPay 的 backend_notify 不帶可信簽章／header（實測 x-api-key 為空），因此
// 改用我們自己的 partner_key 主動向 TapPay 回查該筆交易是否存在、金額為何，
// 作為 notify 的驗真依據（防偽造 notify 騙系統開卡）。
// 文件：https://docs.tappaysdk.com/tutorial/zh/back.html#record-api
export async function tapPayQueryTrade(
  recTradeId: string,
  gateway: string = 'tappay_credit',
): Promise<
  | {
      ok: true
      recTradeId: string
      amount: number
      currency?: string
      orderNumber: string
      recordStatus: number
      merchantId?: string
      /** 這次查詢所用 gateway 的商店代號（我方設定值），供 merchant identity 比對 */
      queriedMerchantId: string
      cardCountry?: string
      raw: unknown
    }
  | { ok: false; message: string; raw?: unknown }
> {
  if (!recTradeId) return { ok: false, message: 'no rec_trade_id' }
  const { partnerKey, merchantId: queriedMerchantId, baseUrl } = await getConfig(gateway)

  const res = await fetch(`${baseUrl}/transaction/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': partnerKey },
    body: JSON.stringify({
      partner_key: partnerKey,
      filters: { rec_trade_id: recTradeId },
      records_per_page: 1,
      page: 0,
    }),
  })

  const data = await res.json()
  // ⚠ Record API 即使「查到資料」也常回 status=2 ("End of list")——那是分頁結尾的
  //   正常標記、不是錯誤。所以不能用 data.status 判斷成敗，要直接看 trade_records
  //   裡有沒有對應 rec_trade_id 的那筆。
  const records: Array<Record<string, unknown>> = Array.isArray(data.trade_records) ? data.trade_records : []
  // 只認 rec_trade_id 完全相符的那筆。舊寫法在找不到時退回 records[0]，等於「filter 沒
  // 生效時改用 TapPay 隨便回的一筆交易來驗真」——那正是要防的張冠李戴（P0-1）。
  const rec = records.find(r => String(r.rec_trade_id) === recTradeId)
  if (!rec) return { ok: false, message: `trade record not found (query status ${data.status} ${data.msg ?? ''})`, raw: data }
  // 發卡國別（信用卡才有；用於後台手續費 國內2.2%/國外2.8% 判斷）
  const rci = rec.card_info as { country_code?: string; country?: string } | undefined
  return {
    ok: true,
    recTradeId: String(rec.rec_trade_id),
    amount: Number(rec.amount),
    currency: rec.currency == null ? undefined : String(rec.currency),
    orderNumber: String(rec.order_number ?? ''),
    recordStatus: Number(rec.record_status),
    merchantId: rec.merchant_id == null ? undefined : String(rec.merchant_id),
    queriedMerchantId,
    cardCountry: rci?.country_code ?? rci?.country,
    raw: rec,
  }
}

// ─── 交易 ↔ 本地訂單綁定驗真（P0-1 / P0-2）──────────────────────────
// TapPay notify 是無簽章的公開 endpoint，body（order_number / rec_trade_id / status）
// 完全由呼叫端決定。只確認「這個 rec_trade_id 查得到、金額對」不足以證明這筆交易是
// 「這張訂單」的付款：兩張同金額訂單之間可以互相冒用。任何會讓訂單進入 PAID /
// FAILED / REFUND 的流程都必須走這裡，期望值一律由呼叫端從 DB 取
// （server-side authoritative），不可用 webhook body 當期望值。
//
// 綁定核心只有一份（bindTapPayTradeToOrder），兩個對外函式差在「綁定成立之後，
// provider 端的交易狀態必須是成功還是不成功」：
//   verifyTapPayTransactionForOrder → 承認付款 / 退款前用（必須成功且金額相符）
//   verifyTapPayFailureForOrder     → 承認付款失敗前用（必須確實不是成功狀態）
export type TapPayVerifyFailure =
  | 'missing_expected'
  | 'trade_not_found'
  | 'rec_trade_id_mismatch'
  | 'order_number_mismatch'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'merchant_mismatch'
  | 'record_status_not_paid'
  | 'record_status_not_failed'

export interface TapPayTransactionBinding {
  /** 正在處理的交易編號（webhook body 或 DB 既存值） */
  recTradeId: string
  /** 期望的 TapPay order_number＝Order.tapPayOrderId（DB 值，非 webhook body） */
  orderNumber: string
  /** 期望的付款方式（DB 值）→ 決定 gateway 與商店代號 */
  paymentMethod: PaymentMethod
}

export interface TapPayExpectedTransaction extends TapPayTransactionBinding {
  /** 期望的應付金額（bundle＝整組加總；DB 值） */
  amount: number
}

export type TapPayVerifyResult =
  | { ok: true; recordStatus: number; cardCountry?: string }
  | { ok: false; reason: TapPayVerifyFailure; detail: Record<string, unknown> }

// 付款方式 → TapPay gateway（PaymentConfig.gateway）。查詢與退款都必須用「該訂單
// 實際付款的那個商店」設定，故放在這裡當單一來源，不要在各 route 自己寫三元式。
export function tapPayGatewayFor(paymentMethod: PaymentMethod): string {
  return paymentMethod === 'LINE_PAY' ? 'tappay_linepay' : 'tappay_credit'
}

// record_status（TapPay Record API）：
//   0 = 已授權未請款（信用卡；TapPay 會在 cap_millis 自動請款）
//   1 = 交易完成／已請款（LINE Pay 即時請款）
// 兩者都代表「款項已成立」；其餘（-1 錯誤／2,3 退款／4 待付款／5 取消）都不是。
const PAID_RECORD_STATUS = [0, 1]

type TapPayQueriedTrade = Extract<Awaited<ReturnType<typeof tapPayQueryTrade>>, { ok: true }>

// 綁定核心：證明「這筆 provider 交易屬於這張本地訂單」。不判斷付款成功與否。
async function bindTapPayTradeToOrder(
  expected: TapPayTransactionBinding,
): Promise<{ ok: true; trade: TapPayQueriedTrade; gateway: string } | { ok: false; reason: TapPayVerifyFailure; detail: Record<string, unknown> }> {
  if (!expected.recTradeId || !expected.orderNumber) {
    // 期望值不齊全就不可能完成綁定比對（例如 webhook 沒帶 rec_trade_id、或訂單
    // 還沒寫入 tapPayOrderId）→ 一律不放行，不猜。
    return { ok: false, reason: 'missing_expected', detail: { hasRecTradeId: !!expected.recTradeId, hasOrderNumber: !!expected.orderNumber } }
  }

  const gateway = tapPayGatewayFor(expected.paymentMethod)
  const trade = await tapPayQueryTrade(expected.recTradeId, gateway)
  if (!trade.ok) {
    return { ok: false, reason: 'trade_not_found', detail: { gateway, message: trade.message } }
  }

  // 交易編號：Record API 回來的必須就是我們正在處理的那筆
  if (trade.recTradeId !== expected.recTradeId) {
    return { ok: false, reason: 'rec_trade_id_mismatch', detail: { gateway } }
  }

  // ★ 綁定核心：provider 端記錄的 order_number 必須等於這張訂單的 tapPayOrderId。
  //   少了這一條，任何一筆合法交易都能拿去付（或退）「別張訂單」。
  if (trade.orderNumber !== expected.orderNumber) {
    return {
      ok: false,
      reason: 'order_number_mismatch',
      detail: { gateway, expectedOrderNumber: expected.orderNumber, gotOrderNumber: trade.orderNumber },
    }
  }

  // Merchant identity：LINE Pay 與信用卡在 TapPay 後台是不同商店代號，比對商店等於
  // 同時確認 gateway 沒被張冠李戴（partner_key 兩者可能共用，擋不住）。採「有回才比」
  // ——env fallback 下兩個 gateway 可能設同一個 merchant_id。
  if (trade.merchantId && trade.merchantId !== trade.queriedMerchantId) {
    return { ok: false, reason: 'merchant_mismatch', detail: { gateway } }
  }

  return { ok: true, trade, gateway }
}

// 承認「這筆交易是這張訂單的成功付款」——標記 PAID 與退款前都必須先過這關。
export async function verifyTapPayTransactionForOrder(
  expected: TapPayExpectedTransaction,
): Promise<TapPayVerifyResult> {
  if (!(expected.amount > 0)) {
    return { ok: false, reason: 'missing_expected', detail: { amount: expected.amount } }
  }

  const bound = await bindTapPayTradeToOrder(expected)
  if (!bound.ok) return bound
  const { trade, gateway } = bound

  if (trade.amount !== expected.amount) {
    return { ok: false, reason: 'amount_mismatch', detail: { gateway, expectedAmount: expected.amount, gotAmount: trade.amount } }
  }

  // 幣別：金額比對要同幣別才有意義。TapPay 未回該欄位時不作為否決依據（欄位缺漏
  // 不應讓正常付款全數卡住），其餘綁定條件已足以擋掉張冠李戴。
  if (trade.currency && trade.currency !== 'TWD') {
    return { ok: false, reason: 'currency_mismatch', detail: { gateway, gotCurrency: trade.currency } }
  }

  if (!PAID_RECORD_STATUS.includes(trade.recordStatus)) {
    return { ok: false, reason: 'record_status_not_paid', detail: { gateway, recordStatus: trade.recordStatus } }
  }

  return { ok: true, recordStatus: trade.recordStatus, cardCountry: trade.cardCountry }
}

// 承認「這筆交易是這張訂單的失敗／取消」——標記 FAILED 前必須先過這關。
// 不比對金額：授權失敗的交易 provider 端金額不一定等於應付金額（可能是 0）。
// 反向守門同樣重要：webhook 說失敗、但 provider 顯示已成功付款時一律不放行，
// 避免把真的付掉的訂單標成 FAILED。
export async function verifyTapPayFailureForOrder(
  expected: TapPayTransactionBinding,
): Promise<TapPayVerifyResult> {
  const bound = await bindTapPayTradeToOrder(expected)
  if (!bound.ok) return bound
  const { trade, gateway } = bound

  if (PAID_RECORD_STATUS.includes(trade.recordStatus)) {
    return { ok: false, reason: 'record_status_not_failed', detail: { gateway, recordStatus: trade.recordStatus } }
  }

  return { ok: true, recordStatus: trade.recordStatus }
}

// ─── 退款 ──────────────────────────────────────────────────────────

// gateway 為必填：退款一定要用「該訂單實際付款的那個商店」設定（見 tapPayGatewayFor）。
// 過去寫死 tappay_credit，LINE Pay 訂單會拿信用卡的 partner_key / merchant_id 去退款
// （退款失敗或退到錯的商店）。留預設值等於把這個 bug 留成預設行為，故不給預設值。
export async function tapPayRefund(
  recTradeId: string,
  amount: number,
  gateway: string,
): Promise<{ ok: boolean; message?: string }> {
  const { partnerKey, baseUrl } = await getConfig(gateway)

  const res = await fetch(`${baseUrl}/transaction/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': partnerKey,
    },
    body: JSON.stringify({
      rec_trade_id: recTradeId,
      amount,
      partner_key: partnerKey,
    }),
  })

  const data = await res.json()
  if (data.status !== 0) return { ok: false, message: data.msg ?? '退款失敗' }
  return { ok: true }
}

// ─── LINE Pay ──────────────────────────────────────────────────────
// TapPay LINE Pay 同樣走 Pay by Prime，但：
//   1. prime 由前端 TPDirect.linePay.getPrime 產生
//   2. result_url 放在「最外層」（與信用卡 3DS 的 three_domain_secure 包法不同）
//   3. merchant_id 通常是 TapPay 後台另開的 LINE Pay 商店代號（gateway = tappay_linepay）
//   4. 一定會回傳 payment_url，前端需導轉至該網址讓使用者於 LINE 完成授權，
//      實際付款結果由 backend_notify_url（/api/payment/tappay/notify）非同步通知。

export interface TapPayLinePayChargeInput {
  prime: string
  orderId: string
  amount: number
  details: string
  cardholder: {
    phone_number: string
    name: string
    email: string
  }
  resultUrl: {
    frontendRedirectUrl: string
    backendNotifyUrl: string
  }
}

export async function tapPayChargeLinePay(
  input: TapPayLinePayChargeInput,
): Promise<TapPayChargeResult> {
  const { partnerKey, merchantId, baseUrl } = await getConfig('tappay_linepay')

  const body = {
    prime: input.prime,
    partner_key: partnerKey,
    merchant_id: merchantId,
    details: input.details,
    amount: input.amount,
    currency: 'TWD',
    order_number: input.orderId,
    cardholder: input.cardholder,
    // LINE Pay 為導轉型付款，result_url 放最外層
    result_url: {
      frontend_redirect_url: input.resultUrl.frontendRedirectUrl,
      backend_notify_url: input.resultUrl.backendNotifyUrl,
    },
  }

  const res = await fetch(`${baseUrl}/payment/pay-by-prime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': partnerKey,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (data.status !== 0) {
    const tail = data.msg ? `（代碼 ${data.status}：${data.msg}）` : `（代碼 ${data.status}）`
    return { ok: false, message: `LINE Pay 付款失敗，請稍後再試或改用其他付款方式${tail}` }
  }

  // LINE Pay 必定回傳 payment_url；若沒有代表設定有誤
  if (!data.payment_url) {
    return { ok: false, message: 'LINE Pay 未回傳付款連結，請確認商店設定' }
  }

  return {
    ok: true,
    recTradeId: data.rec_trade_id ?? '',
    bankTransactionId: data.bank_transaction_id ?? '',
    paymentUrl: data.payment_url as string,
  }
}
