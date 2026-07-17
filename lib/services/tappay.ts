// TapPay Pay by Prime / Pay by Token API

// 金鑰一律經 tenant-config service 解密讀取（單一來源，route/service 不各寫一套）
import { getPaymentConfig } from '@/lib/services/tenant-config'

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
      cardInfo?: { lastFour?: string; type?: number; funding?: number; expiryDate?: string }
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

async function getConfig(tenantAdminId?: string | null, gateway: string = 'tappay_credit') {
  if (tenantAdminId) {
    const cfg = await getPaymentConfig(tenantAdminId, gateway)  // partnerKey 已解密
    if (cfg && cfg.isActive) {
      return {
        partnerKey: cfg.partnerKey,
        merchantId: cfg.merchantId,
        baseUrl: cfg.env === 'production'
          ? 'https://prod.tappaysdk.com/tpc'
          : 'https://sandbox.tappaysdk.com/tpc',
      }
    }
    // 指定了租戶卻查無啟用設定 → 明確報錯，不退回平台全域 env（避免漏設定的白牌
    // 靜默用平台帳號收款）。env fallback 只給「無租戶」的單租戶/開發情境。
    throw new Error(`此商店尚未設定${gateway === 'tappay_linepay' ? 'LINE Pay' : '信用卡'}金流，請至後台「金流設定」填寫後再付款`)
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

export async function tapPayCharge(input: TapPayChargeInput, tenantAdminId?: string | null): Promise<TapPayChargeResult> {
  const { partnerKey, merchantId, baseUrl } = await getConfig(tenantAdminId, 'tappay_credit')

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
  const ci = data.card_info as { last_four?: string; type?: number; funding?: number; expiry_date?: string } | undefined

  return {
    ok: true,
    recTradeId: data.rec_trade_id ?? '',
    bankTransactionId: data.bank_transaction_id ?? '',
    ...(data.payment_url ? { paymentUrl: data.payment_url as string } : {}),
    ...(cs?.card_key && cs?.card_token ? { cardSecret: { cardKey: cs.card_key, cardToken: cs.card_token } } : {}),
    ...(ci ? { cardInfo: { lastFour: ci.last_four, type: ci.type, funding: ci.funding, expiryDate: ci.expiry_date } } : {}),
  }
}

export async function tapPayChargeByToken(input: TapPayTokenChargeInput, tenantAdminId?: string | null): Promise<TapPayChargeResult> {
  const { partnerKey, merchantId, baseUrl } = await getConfig(tenantAdminId, 'tappay_credit')

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
  const ci = data.card_info as { last_four?: string; type?: number; funding?: number; expiry_date?: string } | undefined

  return {
    ok: true,
    recTradeId: data.rec_trade_id ?? '',
    bankTransactionId: data.bank_transaction_id ?? '',
    ...(data.payment_url ? { paymentUrl: data.payment_url as string } : {}),
    ...(cs?.card_key && cs?.card_token ? { cardSecret: { cardKey: cs.card_key, cardToken: cs.card_token } } : {}),
    ...(ci ? { cardInfo: { lastFour: ci.last_four, type: ci.type, funding: ci.funding, expiryDate: ci.expiry_date } } : {}),
  }
}

// ─── Record API：用 rec_trade_id 回查交易真偽 ───────────────────────
// TapPay 的 backend_notify 不帶可信簽章／header（實測 x-api-key 為空），因此
// 改用我們自己的 partner_key 主動向 TapPay 回查該筆交易是否存在、金額為何，
// 作為 notify 的驗真依據（防偽造 notify 騙系統開卡）。
// 文件：https://docs.tappaysdk.com/tutorial/zh/back.html#record-api
export async function tapPayQueryTrade(
  recTradeId: string,
  tenantAdminId?: string | null,
  gateway: string = 'tappay_credit',
): Promise<
  | { ok: true; amount: number; orderNumber: string; recordStatus: number; raw: unknown }
  | { ok: false; message: string; raw?: unknown }
> {
  if (!recTradeId) return { ok: false, message: 'no rec_trade_id' }
  const { partnerKey, baseUrl } = await getConfig(tenantAdminId, gateway)

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
  const rec = records.find(r => String(r.rec_trade_id) === recTradeId) ?? records[0]
  if (!rec) return { ok: false, message: `trade record not found (query status ${data.status} ${data.msg ?? ''})`, raw: data }
  return {
    ok: true,
    amount: Number(rec.amount),
    orderNumber: String(rec.order_number ?? ''),
    recordStatus: Number(rec.record_status),
    raw: rec,
  }
}

// ─── Webhook 驗章（已棄用：header 比對無效）─────────────────────────
// ⚠ 實測 TapPay 的 backend_notify 不帶 x-api-key header，下面這支以 header 比對
//   的方式永遠失敗。notify 已改用 tapPayQueryTrade（Record API）驗真。此函式僅
//   保留相容，勿用於新流程。
// TapPay 未提供 HMAC signature；防偽靠 partner_key header 比對

export async function verifyTapPayWebhook(req: Request, tenantAdminId?: string | null): Promise<boolean> {
  const key = req.headers.get('x-api-key')

  if (tenantAdminId) {
    const cfg = await getPaymentConfig(tenantAdminId, 'tappay_credit')  // partnerKey 已解密
    if (cfg && cfg.isActive) {
      return key === cfg.partnerKey
    }
  }

  return key === process.env.TAPPAY_PARTNER_KEY
}

// ─── 退款 ──────────────────────────────────────────────────────────

export async function tapPayRefund(
  recTradeId: string,
  amount: number,
  tenantAdminId?: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const { partnerKey, baseUrl } = await getConfig(tenantAdminId, 'tappay_credit')

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
  tenantAdminId?: string | null,
): Promise<TapPayChargeResult> {
  const { partnerKey, merchantId, baseUrl } = await getConfig(tenantAdminId, 'tappay_linepay')

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
