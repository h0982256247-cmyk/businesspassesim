import crypto from 'crypto'
import { Agent } from 'undici'
import { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { markOrderCompleted } from './order'
import { notifyEsimPending } from './notification'
import { recordAlert } from './alert'
import { getEsimConfig } from './tenant-config'
import { safeDecrypt } from '@/lib/utils/crypto'
import { encryptEsimFields } from '@/lib/utils/esim-crypto'

// ─── 世界移動 API 簽章 ────────────────────────────────────────────

function buildWmSignature(merchantId: string, deptId: string, token: string, body: string): string {
  // SHA-1(merchantId + deptId + token + body)
  const raw = merchantId + deptId + token + body
  return crypto.createHash('sha1').update(raw).digest('hex')
}

// 世界移動「測試機」(tfmshippingsys) 使用自簽 SSL 憑證，Node fetch 預設會拒絕 →
// 'fetch failed'、卡發不出。僅對測試機放行不驗憑證；正式機 (fmshippingsys) 憑證正常、
// 維持完整驗證。所有 WM fetch 的 init 都經 wmFetchInit() 包一層。
let wmInsecureAgent: Agent | null = null
function wmFetchInit(apiUrl: string, init: RequestInit): RequestInit {
  if (!/tfmshippingsys\./i.test(apiUrl)) return init  // 正式機：維持驗證
  if (!wmInsecureAgent) wmInsecureAgent = new Agent({ connect: { rejectUnauthorized: false } })
  return { ...init, dispatcher: wmInsecureAgent } as RequestInit
}

// 單一品牌：世界移動設定取自全域 EsimConfig（singleton），未設定則退回 env（開發用）。
async function getWmConfig() {
  const cfg = await getEsimConfig()  // token 已解密
  if (cfg && cfg.isActive) {
    return { apiUrl: cfg.apiUrl, merchantId: cfg.merchantId, deptId: cfg.deptId, token: cfg.token }
  }

  const apiUrl = process.env.NODE_ENV === 'production'
    ? process.env.ESIM_SUPPLIER_API_URL!
    : (process.env.ESIM_SUPPLIER_API_URL_TEST ?? process.env.ESIM_SUPPLIER_API_URL!)
  const merchantId = process.env.ESIM_MERCHANT_ID!
  const deptId = process.env.ESIM_DEPT_ID!
  const token = process.env.ESIM_TOKEN!

  if (!merchantId || !deptId || !token) throw new Error('World Move API credentials not set')
  return { apiUrl, merchantId, deptId, token }
}

async function wmPost(endpoint: string, payload: object): Promise<unknown> {
  const { apiUrl, merchantId, deptId, token } = await getWmConfig()
  const body = JSON.stringify(payload)
  const sign = buildWmSignature(merchantId, deptId, token, body)

  const res = await fetch(`${apiUrl}${endpoint}`, wmFetchInit(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'merchantId': merchantId,
      'deptId': deptId,
      'sign': sign,
    },
    body,
  }))

  if (!res.ok) throw new Error(`World Move API HTTP ${res.status}`)
  return res.json()
}

// ─── 查詢訂單 eSIM 啟動碼 ────────────────────────────────────────

interface WmEsimResult {
  wmOrderId: string
  wmOrderSn?: string
  wmOrderTime?: string
  esimRcode?: string
  esimQrcode?: string
  esimLpa?: string
  esimPin1?: string
  esimPin2?: string
  esimPuk1?: string
  esimPuk2?: string
  esimCfCode?: string
  esimApnExplain?: string
  esimIccid?: string
  activationStart?: Date
  activationEnd?: Date
}

// 2.3 eSIM 訂單查詢：異常情況（如收不到 2.2 callback）時主動查回兌換碼。
// 端點 /Api/SOrder/querybuyesim；encStr = SHA1(merchantId + orderId + token)（不含 deptId、不含 body）。
// 回應與 2.2 callback 同結構：itemList[0].redemptionCode → esimRcode、iccid → esimIccid；
// 此階段尚無 QR/LPA/PIN/PUK（要兌換後 3.2 callback 才有）。
// 對外亦供 2.2 webhook 做「回查驗真」：該 callback 無簽章，落地資料一律以本查詢為準。
export async function fetchEsimCodes(wmOrderId: string): Promise<WmEsimResult | null> {
  try {
    // getWmConfig 併入 try：設定缺漏時本函式應回 null（見簽章），不可往外丟例外——
    // 呼叫端（2.2 webhook、重試 cron）都以 null 當「查不到」處理。
    const { apiUrl, merchantId, token } = await getWmConfig()
    const encStr = crypto.createHash('sha1').update(merchantId + wmOrderId + token).digest('hex')
    const res = await fetch(`${apiUrl}/Api/SOrder/querybuyesim`, wmFetchInit(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId, orderId: wmOrderId, encStr }),
    }))
    let data: Record<string, unknown> | null = null
    try { data = await res.json() as Record<string, unknown> } catch { /* 非 JSON */ }
    // 不靜默吞錯：查詢失敗（HTTP error / code 非 0）記告警，否則「補發為何沒成功」查無可查。
    if (!res.ok || !data || data.code !== 0) {
      await recordAlert('wm_query_failed', {
        wmOrderId,
        httpStatus: res.status,
        wmCode: data?.code ?? null,
        wmMsg: (data?.msg ?? data?.message ?? null) as string | null,
      })
      return null
    }
    const item = (data.itemList as Record<string, unknown>[] | undefined)?.[0]
    if (!item?.redemptionCode) return null
    // 兌換後的憑證欄位（QR / LPA / PIN / PUK）：目前實測 2.3 只回 redemptionCode + iccid，
    // 但欄位名稱與 3.2 callback 同一套，若 WM 之後（或兌換後）有回就直接採用——
    // 有 authoritative 值時一律優先於 webhook body（見 verifyRedeemedCredential）。
    // ⚠ 是否真的會回，尚未向世界移動確認；沒回就是 undefined，行為不變。
    const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
    return {
      wmOrderId,
      wmOrderSn: data.orderSN as string | undefined,
      wmOrderTime: data.orderTime as string | undefined,
      esimRcode: item.redemptionCode as string | undefined,
      esimIccid: str(item.iccid),
      esimQrcode: str(item.qrcode),
      esimLpa: str(item.qrcodeContent),
      esimPin1: str(item.pin1),
      esimPin2: str(item.pin2),
      esimPuk1: str(item.puk1),
      esimPuk2: str(item.puk2),
      esimCfCode: str(item.cfCode),
      esimApnExplain: str(item.apnExplain),
    }
  } catch (err) {
    await recordAlert('wm_query_exception', {
      wmOrderId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─── 兌換憑證驗真（P0-4）──────────────────────────────────────────
// 3.2 兌換 callback 是公開端點、WM 不提供簽章。這裡做的事只有一件：
// 「能向供應商回查到值時，以回查值為準；回查不到就照 callback 原樣寫入」。
//
// 為什麼不做來源網域白名單（原本有、後來拿掉）：
//   世界移動的 QR 圖片網域與 SM-DP+ 網域都不等於 API 主機網域，且對方無法配合
//   提供正式清單。把網域比對當閘門的結果是「合法 callback 全被擋、沒人拿得到 QR」，
//   而且訂單一旦 COMPLETED 就沒有任何自動補救路徑。權衡後改為不擋。
//
// 殘餘風險（明確記錄，不是遺漏）：
//   知道某張卡 rcode 的人，可以送一則偽造 callback 把 QR/LPA 換成自己的 profile。
//   但 rcode 本身就能直接去世界移動把那張卡兌換掉——拿到 rcode 已經等於拿到卡，
//   所以這條路徑增加的是「劫持」而非「竊取」。rcode 只出現在擁有者的 LIFF 頁面與
//   後台，不對外公開；真正的防線是 esimRcode 不外流（見 redactEsimCredentials）。
export interface RedeemedCredential {
  esimQrcode?: string
  esimLpa?: string
  esimIccid?: string
  esimPin1?: string
  esimPin2?: string
  esimPuk1?: string
  esimPuk2?: string
  esimCfCode?: string
  esimApnExplain?: string
}

export type VerifyRedeemedResult =
  | { ok: true; credential: RedeemedCredential; source: 'supplier' | 'signal'; warning?: string }
  | { ok: false; reason: string }

const str = (v: unknown): string | undefined =>
  (typeof v === 'string' && v.trim() !== '' ? v : undefined)

export function verifyRedeemedCredential(input: {
  /** 3.2 webhook body */
  signal: Record<string, unknown>
  /** 本地訂單的兌換碼（DB 值） */
  expectedRcode: string
  /** 2.3 回查結果；null 代表查不到／查詢失敗 → 改用 body，不擋流程 */
  supplier: WmEsimResult | null
}): VerifyRedeemedResult {
  const { signal, expectedRcode, supplier } = input

  if (!expectedRcode) return { ok: false, reason: 'no_local_rcode' }
  // 訂單是用 body.rcode 找出來的，這條理論上恆真；留著當不變量斷言。
  if (str(signal.rcode) !== expectedRcode) return { ok: false, reason: 'signal_rcode_mismatch' }

  // 回查只用來「取得更可信的值」，不當閘門：查不到或對不上就記 warning 走 body。
  // warning 會由呼叫端寫進 system_alerts，讓對不上的情況看得見但不阻斷交付。
  let trusted: WmEsimResult | null = supplier
  let warning: string | undefined
  if (!supplier) {
    warning = 'supplier_query_failed'
    trusted = null
  } else if (supplier.esimRcode !== expectedRcode) {
    warning = 'supplier_rcode_mismatch'
    trusted = null
  }

  const pick = (fromSupplier: string | undefined, fromSignal: unknown) =>
    (trusted ? fromSupplier : undefined) ?? str(fromSignal)

  const qrcode = pick(trusted?.esimQrcode, signal.qrcode)
  const lpa = pick(trusted?.esimLpa, signal.qrcodeContent)
  const iccid = pick(trusted?.esimIccid, signal.iccid)

  // 一則兌換成功通知至少要帶得出 QR 或 LPA，否則沒有可寫的憑證（不寫空白蓋掉既有值）
  if (!qrcode && !lpa) return { ok: false, reason: 'no_credential' }

  return {
    ok: true,
    source: trusted && (trusted.esimQrcode || trusted.esimLpa) ? 'supplier' : 'signal',
    ...(warning ? { warning } : {}),
    credential: {
      ...(qrcode ? { esimQrcode: qrcode } : {}),
      ...(lpa ? { esimLpa: lpa } : {}),
      ...(iccid ? { esimIccid: iccid } : {}),
      ...(pick(trusted?.esimPin1, signal.pin1) ? { esimPin1: pick(trusted?.esimPin1, signal.pin1) } : {}),
      ...(pick(trusted?.esimPin2, signal.pin2) ? { esimPin2: pick(trusted?.esimPin2, signal.pin2) } : {}),
      ...(pick(trusted?.esimPuk1, signal.puk1) ? { esimPuk1: pick(trusted?.esimPuk1, signal.puk1) } : {}),
      ...(pick(trusted?.esimPuk2, signal.puk2) ? { esimPuk2: pick(trusted?.esimPuk2, signal.puk2) } : {}),
      ...(pick(trusted?.esimCfCode, signal.cfCode) ? { esimCfCode: pick(trusted?.esimCfCode, signal.cfCode) } : {}),
      ...(pick(trusted?.esimApnExplain, signal.apnExplain) ? { esimApnExplain: pick(trusted?.esimApnExplain, signal.apnExplain) } : {}),
    },
  }
}

// ─── 下單到世界移動（PUSH 流程：2.1 eSIM下單）────────────────────
//
// 流程：付款 → 我們呼叫 /Api/SOrder/mybuyesim (systemMail=false) → 拿到 wmOrderId
//   → WM 1-3 分鐘內推 2.2 callback → 我們收到 rcode（但還沒 QR）
//   → 用戶按「我要安裝」→ 我們呼叫 3.1 → WM 推 3.2 callback 給 QR + LPA
//
// 為什麼 systemMail=false：我們透過 LIFF 自己給用戶看 QR，不需要 WM 寄信。
// 但 email 欄位仍是必填（WM 要求），用戶 email 解密後傳入；無 email 則用 lineUid 組 placeholder。

// 下單結果三分法（P0-3）。關鍵在於區分「確定沒買到」與「可能買到了但我們不知道」：
//   ordered — 拿到供應商訂單編號
//   failed  — 確定沒有在供應商端建立訂單（根本沒送出，或供應商明確拒絕）→ 可安全重試
//   unknown — 送出後結果不明（逾時／無法解析／回成功卻沒編號）→ 供應商可能已建立訂單，
//             絕不可自動重下單，否則就是買第二張卡
type PlaceWmOrderResult =
  | { outcome: 'ordered'; wmOrderId: string }
  | { outcome: 'failed'; reason: string }
  | { outcome: 'unknown'; reason: string }

async function placeWmOrder(orderId: string): Promise<PlaceWmOrderResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: { include: { product: { include: { supplierProduct: true } } } },
      user:       { select: { lineUid: true, email: true } },
    },
  })
  if (!order || !order.orderItems[0]) {
    await recordAlert('wm_order_no_item', { orderId })
    return { outcome: 'failed', reason: 'no_item' }
  }

  const item = order.orderItems[0]
  const wmproductId = item.product.supplierProduct?.wmProductId
  if (!wmproductId) {
    // 商品沒對到世界移動 wmProductId（如假 SKU / 未同步）→ 付款成功卻開不了卡，必須告警
    await recordAlert('wm_order_no_wmproductid', { orderId, productId: item.productId })
    return { outcome: 'failed', reason: 'no_wmproductid' }
  }

  // 取用戶 email（可能加密）；沒有就用 lineUid 組 placeholder（systemMail=false 不會真的寄）
  const rawEmail = order.user.email
  const email = rawEmail
    ? safeDecrypt(rawEmail)
    : `${order.user.lineUid}@noreply.local`

  const { apiUrl, merchantId, deptId, token } = await getWmConfig()
  const qty = item.qty
  const prodList = [{ wmproductId, qty }]

  // encStr = SHA1(merchantId + deptId + email + prodList(wmproductId+qty) + token)
  const prodListStr = prodList.map(p => p.wmproductId + p.qty).join('')
  const raw = merchantId + deptId + email + prodListStr + token
  const encStr = crypto.createHash('sha1').update(raw).digest('hex')

  try {
    const res = await fetch(`${apiUrl}/Api/SOrder/mybuyesim`, wmFetchInit(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId, deptId, email, prodList,
        systemMail: false,    // 不要 WM 寄 mail，我們透過 LIFF 顯示
        encStr,
      }),
    }))
    let data: Record<string, unknown> | null = null
    try { data = await res.json() as Record<string, unknown> } catch { /* 非 JSON */ }

    // 供應商明確回覆失敗（body 有 code 且非 0）→ 確定沒建立訂單，可安全重試
    if (data && data.code != null && Number(data.code) !== 0) {
      // 付款成功卻 WM 下單失敗（最該被看到的狀況）→ 告警，後台儀表板會跳紅
      await recordAlert('wm_order_failed', {
        orderId, wmProductId: wmproductId,
        httpStatus: res.status,
        wmCode: data.code ?? null,
        wmMsg: (data.msg ?? data.message ?? null) as string | null,
      })
      return { outcome: 'failed', reason: `wm_code_${data.code}` }
    }
    // HTTP 錯誤／無法解析的回應：可能是上游 proxy 逾時，供應商那端也可能已經成立訂單
    if (!res.ok || !data) return { outcome: 'unknown', reason: `http_${res.status}_unparsable` }
    const wmOrderId = data.orderId as string | undefined
    // 回成功卻沒帶訂單編號 → 我們無從追蹤這張卡，一樣當作未知（不可再下一張）
    if (!wmOrderId) return { outcome: 'unknown', reason: 'no_order_id_in_success_response' }
    return { outcome: 'ordered', wmOrderId }
  } catch (err) {
    // 連線層例外（逾時／中斷）：請求可能已抵達供應商並成立訂單 → 未知，不可自動重下單
    await recordAlert('wm_order_exception', {
      orderId, wmProductId: wmproductId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { outcome: 'unknown', reason: 'request_exception' }
  }
}

// 從世界移動的回應撈憑證欄位。欄位名沿用 3.2 callback / 2.2 callback 那一套
// （qrcode / qrcodeContent / iccid / pin* / puk* / cfCode / apnExplain），回應可能平鋪
// 也可能包在 data 裡，兩層都看。撈不到就回 null——行為與「回應沒帶憑證」完全一致。
// 不對格式再做限制：這是我們自己發起的簽章請求，供應商回什麼就照原樣寫入。
function extractWmCredential(payload: Record<string, unknown>): RedeemedCredential | null {
  const nested = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>
  const pick = (k: string) => str(payload[k]) ?? str(nested[k])

  const lpa = pick('qrcodeContent')
  const qrcode = pick('qrcode')
  if (!lpa && !qrcode) return null

  return {
    ...(qrcode ? { esimQrcode: qrcode } : {}),
    ...(lpa ? { esimLpa: lpa } : {}),
    ...(pick('iccid') ? { esimIccid: pick('iccid') } : {}),
    ...(pick('pin1') ? { esimPin1: pick('pin1') } : {}),
    ...(pick('pin2') ? { esimPin2: pick('pin2') } : {}),
    ...(pick('puk1') ? { esimPuk1: pick('puk1') } : {}),
    ...(pick('puk2') ? { esimPuk2: pick('puk2') } : {}),
    ...(pick('cfCode') ? { esimCfCode: pick('cfCode') } : {}),
    ...(pick('apnExplain') ? { esimApnExplain: pick('apnExplain') } : {}),
  }
}

// ─── 觸發兌換（3.1 兌換兌換碼）— 用戶按「我要安裝」時呼叫 ────────────────

// ownerId：呼叫端已驗過的目前擁有者。這裡再帶進條件式寫入一次——route 的擁有權檢查
// 與這裡寫 redeemedAt 之間隔著一次世界移動 API 呼叫，期間轉贈可能被對方領走，
// 前擁有者的請求就會替新擁有者把卡兌換掉。
export async function triggerEsimRedemption(orderId: string, ownerId: string): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true,
      esimRcode: true, esimQrcode: true,
      redeemedAt: true, activatedAt: true,
    },
  })
  if (!order)                  return { ok: false, reason: '訂單不存在' }
  if (order.status === OrderStatus.REFUNDED || order.status === OrderStatus.CANCELLED)
                               return { ok: false, reason: '訂單已退款或取消，無法兌換' }
  if (!order.esimRcode)        return { ok: false, reason: '兌換碼尚未產生，請稍後再試' }
  if (order.activatedAt)       return { ok: false, reason: '此 eSIM 已激活' }
  if (order.esimQrcode)        return { ok: true }   // QR 已存在 → 幂等
  // redeemedAt 已設但 QR 未到 → 視為已觸發過，等 callback；前端會 polling
  if (order.redeemedAt)        return { ok: true }

  const { apiUrl, merchantId, token } = await getWmConfig()
  const qrcodeType = 2   // 0=URL, 1=文字, 2=兩者
  const rcode = order.esimRcode

  // encStr = SHA1(merchantId + rcode + qrcodeType + token)
  const encStr = crypto.createHash('sha1')
    .update(merchantId + rcode + qrcodeType + token)
    .digest('hex')

  try {
    const res = await fetch(`${apiUrl}/Api/OrderRedemption/redemption`, wmFetchInit(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId, rcode, qrcodeType, encStr }),
    }))
    if (!res.ok) return { ok: false, reason: `WM HTTP ${res.status}` }
    const data = await res.json() as Record<string, unknown>
    if (data.code !== 0) return { ok: false, reason: (data.msg as string) ?? '兌換失敗' }

    // 標記 redeemedAt（3.2 callback 之後會補上 QR/LPA）。條件式：擁有者必須仍是
    // 發起這次請求的人，且尚未兌換過——擋掉「呼叫供應商期間卡被領走」的競態。
    const marked = await prisma.order.updateMany({
      where: { id: orderId, currentOwnerId: ownerId, redeemedAt: null },
      data: { redeemedAt: new Date() },
    })
    if (marked.count !== 1) {
      // 兌換已經對供應商送出了，但本地不該記在這個人頭上。留告警轉人工，
      // 不回 false 讓前端以為可以重按（重按只會再打一次供應商）。
      await recordAlert('esim_redeem_owner_changed', { orderId, level: 'warn' })
    }

    // P0-4 Priority 1：這是我們自己發起、帶簽章的 server→server 請求，回應即 provider
    // authoritative——比公開無簽章的 3.2 webhook 可信。回應若本身就帶 QR / LPA，直接以它
    // 為準寫入，之後 3.2 webhook 會因憑證已存在而冪等早退，body 完全不採用。
    // 條件帶 esimQrcode / esimLpa 為 null：不覆蓋任何既有憑證。
    const fromResponse = extractWmCredential(data)
    if (fromResponse) {
      await prisma.order.updateMany({
        where: { id: orderId, esimQrcode: null, esimLpa: null },
        data: encryptEsimFields({ ...fromResponse }),
      })
    }
    // 只印布林值（憑證內容嚴禁落 log）：用來確認世界移動 3.1 到底有沒有回憑證，
    // 一旦確認會回，就可以把 webhook 來源的 LPA 整條拿掉。
    console.log('[wm-redemption/3.1] response credential', {
      orderId, hasQr: !!fromResponse?.esimQrcode, hasLpa: !!fromResponse?.esimLpa,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : '兌換失敗' }
  }
}

// ─── 主流程：付款後觸發下單（PUSH 模式，不再 polling）─────────────

// 可以下供應商單的本地狀態（付款成功但尚未發卡）。claim 條件的一部分，
// 確保退款／取消後的訂單不會再被任何入口推去買卡。
const SUPPLIER_ORDERABLE_STATUS = [OrderStatus.PAID, OrderStatus.ESIM_PENDING]

// 釋放 claim：只在「確定沒有在供應商端建立訂單」時呼叫。條件帶 wmOrderId: null，
// 避免把已經下單成功的訂單誤放回可重試狀態。
async function releaseSupplierClaim(orderId: string): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, wmOrderId: null },
    data: { supplierOrderClaimedAt: null },
  })
}

export async function triggerEsimActivation(orderId: string): Promise<void> {
  const orderInfo = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      wmOrderId: true,
      supplierOrderClaimedAt: true,
      orderItems: { select: { productName: true } },
    },
  })
  if (!orderInfo) return
  // 先讀一次只是為了省下一次 UPDATE 與取通知用的欄位；真正的守門是下面的條件式 claim。
  // 已有 wmOrderId（已下單）或已有 claim（下單中／結果未知）都不可再下單。
  if (orderInfo.wmOrderId || orderInfo.supplierOrderClaimedAt) return
  const userId = orderInfo.userId ?? ''
  const productName = orderInfo.orderItems[0]?.productName ?? 'eSIM'

  // ★ 原子搶佔（P0-3）：先讀 wmOrderId 再呼叫供應商是 read-then-act，不是鎖——付款
  //   webhook、同步付款、cron、後台補發任兩個並發就會各買一張卡。改成 DB 條件式更新，
  //   只有把 supplierOrderClaimedAt 從 NULL 改成現在時間的那一個 worker（count===1）
  //   才能呼叫世界移動。
  const claim = await prisma.order.updateMany({
    where: {
      id: orderId,
      wmOrderId: null,
      supplierOrderClaimedAt: null,
      status: { in: SUPPLIER_ORDERABLE_STATUS },
    },
    data: { supplierOrderClaimedAt: new Date() },
  })
  // 搶輸／已下過單／狀態不允許（已退款取消）→ 什麼都不做。這不是失敗，不可告警、
  // 不可推「補發中」通知，否則正常的並發會被誤報成問題。
  if (claim.count !== 1) return

  // 只負責下單，等 WM 推 2.2 callback 完成餘下流程
  const result = await placeWmOrder(orderId)

  if (result.outcome === 'failed') {
    // 確定沒有在供應商端建立訂單 → 釋放 claim，讓 cron／後台補發可以安全重試。
    // 訂單維持 PAID（付款成功但尚未發卡），不再轉成 ESIM_PENDING。
    // ⚠ 不要靜默：印出 log（Vercel 可見），訂單留在「PAID 且無 esimRcode」可被
    // retry cron / 後台補發撈到。這段過去靜默吞錯，是「付款成功卻沒收到 eSIM」
    // 最難 debug 的主因。
    await releaseSupplierClaim(orderId)
    console.error('[esim] placeWmOrder 失敗，訂單維持 PAID 待重試', { orderId, reason: result.reason })
    notifyEsimPending(userId, productName).catch(() => {})
    return
  }

  if (result.outcome === 'unknown') {
    // 供應商可能已經建立訂單（逾時／回應無法解析）。claim 刻意保留 → 系統不會再買
    // 第二張；改由告警轉人工對帳（到世界移動後台查該筆是否成立，再決定補 wmOrderId
    // 或釋放 claim）。這裡若為了「自動恢復」而釋放 claim，就是重複下單的來源。
    await recordAlert('wm_order_unknown_outcome', {
      orderId, reason: result.reason, level: 'error',
    })
    return
  }

  // 下單成功：寫回供應商訂單編號（條件帶 wmOrderId: null，不覆蓋既有值）
  try {
    const write = await prisma.order.updateMany({
      where: { id: orderId, wmOrderId: null },
      data: { wmOrderId: result.wmOrderId },
    })
    if (write.count !== 1) {
      // 走到這裡代表期間有別的流程寫入了 wmOrderId → 可能已存在兩張供應商訂單
      await recordAlert('wm_order_unknown_outcome', {
        orderId, wmOrderId: result.wmOrderId, reason: 'wm_order_id_already_written', level: 'error',
      })
    }
  } catch (err) {
    // 供應商已經成立訂單、但我們沒寫進 DB：claim 保留（不會再下單），並把供應商
    // 訂單編號寫進告警，人工可直接回填。這是最容易買到第二張卡的路徑。
    await recordAlert('wm_order_unknown_outcome', {
      orderId, wmOrderId: result.wmOrderId, reason: 'db_write_failed',
      error: err instanceof Error ? err.message : String(err), level: 'error',
    })
  }
  // 訂單維持 PAID 狀態；callback 到了會轉成 COMPLETED
  // 若 callback 久未到（>5 分鐘），cron 或 admin 補發機制處理
}

// ─── 查詢 eSIM 用量 ───────────────────────────────────────────────

export interface EsimUsage {
  iccid: string
  totalData: number    // MB
  usedData: number     // MB
  remainingData: number // MB
  unit: string         // 'MB' | 'GB'
}

export async function queryEsimUsage(iccid: string): Promise<EsimUsage | null> {
  try {
    const data = await wmPost('/api/esim/usage', { iccid }) as Record<string, unknown>
    if (!data || data.code !== '0000') return null

    const d = data.data as Record<string, unknown>
    if (!d) return null

    const totalData = Number(d.totalData ?? d.total ?? 0)
    const usedData = Number(d.usedData ?? d.used ?? 0)
    const unit = (d.dataUnit ?? d.unit ?? 'MB') as string

    return {
      iccid,
      totalData,
      usedData,
      remainingData: Math.max(0, totalData - usedData),
      unit,
    }
  } catch {
    return null
  }
}

// ─── 查詢我的報價（myQueryAll）────────────────────────────────────
// 端點：/Api/QuoteMg/myQueryAll
// 簽章：SHA-1(merchantId + token)  ← 不含 deptId 也不含 body
// ▲ 世界移動建議每週查詢一次；切勿在每筆訂購時呼叫，否則將被鎖 IP。

export interface SupplierProductInfo {
  wmproductId:    string
  productId?:     string  // 供應商自身商品編號
  productName?:   string  // 商品名稱（如 "Japan, 3 Days, 1GB"）
  productRegion?: string  // 適用地區
  productPrice:   number  // 經銷商成本價（台幣）
  productType:    number  // 0=eSIM, 1=SIM卡, 2=充值SIM卡
  leSIM:          boolean // true=世界移動, false=當地供應商
}

export type SupplierProductMap = Map<string, SupplierProductInfo>

/**
 * 向世界移動取得所有可購買方案清單，回傳以 wmproductId 為 key 的 Map。
 * 一次呼叫取回全部，供呼叫端批次比對，請勿逐筆觸發。
 */
export async function fetchSupplierProductMap(): Promise<SupplierProductMap> {
  const { apiUrl, merchantId, token } = await getWmConfig()
  // 此端點簽章只用 merchantId + token，不帶 deptId 也不帶 body
  const encStr = crypto.createHash('sha1').update(merchantId + token).digest('hex')

  // 8 秒 timeout：上游掛掉時不要拖死整個匯入流程，呼叫端（如 CSV import）會 fallback
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 8000)
  let res: Response
  try {
    res = await fetch(`${apiUrl}/Api/QuoteMg/myQueryAll`, wmFetchInit(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId, encStr }),
      signal: ac.signal,
    }))
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('World Move QuoteQuery 逾時（8s）')
    throw err
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`World Move QuoteQuery HTTP ${res.status}`)

  const data = await res.json() as Record<string, unknown>
  if (data.code !== 0) throw new Error(`World Move QuoteQuery 失敗：${data.msg ?? data.code}`)

  const map: SupplierProductMap = new Map()
  const list = data.prodList as Record<string, unknown>[] | undefined
  for (const item of list ?? []) {
    const id = item.wmproductId as string | undefined
    if (id) {
      map.set(id, {
        wmproductId:    id,
        productId:      (item.productId      as string | undefined) ?? undefined,
        productName:    (item.productName    as string | undefined) ?? undefined,
        productRegion:  (item.productRegion  as string | undefined) ?? undefined,
        productPrice:   Number(item.productPrice ?? 0),
        productType:    Number(item.productType  ?? 0),
        leSIM:          Boolean(item.leSIM),
      })
    }
  }
  return map
}

// ─── Admin：補發（手動觸發）──────────────────────────────────────

export async function retryEsimActivation(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { wmOrderId: true, supplierOrderClaimedAt: true },
  })
  if (!order) return

  if (order.wmOrderId) {
    const esimData = await fetchEsimCodes(order.wmOrderId)
    if (esimData) {
      // 條件式轉移：只有 PAID / ESIM_PENDING 進得了 COMPLETED。查詢供應商期間訂單
      // 若已被退款／取消（Race A），這裡會被擋下——絕不可把終態復活成 COMPLETED。
      const completed = await markOrderCompleted(orderId, esimData)
      if (!completed.ok && completed.result === 'invalid') {
        console.warn('[esim] 訂單已為終態，補發不寫入 COMPLETED', {
          orderId, currentStatus: completed.current,
        })
      }
    }
    // 已有供應商訂單：查不到兌換碼就等下一輪／人工，絕不重新下單
    return
  }

  // 已 claim 但沒有 wmOrderId ＝ 曾經送出下單、結果未知（見 triggerEsimActivation）。
  // 供應商可能已經成立訂單，這裡自動重下單就是買第二張卡 → 一律轉人工對帳。
  if (order.supplierOrderClaimedAt) {
    await recordAlert('wm_order_claim_stuck', {
      orderId, claimedAt: order.supplierOrderClaimedAt.toISOString(), level: 'error',
    })
    return
  }

  // 重新下單
  await triggerEsimActivation(orderId)
}

// ─── 自動重試：掃描卡住的開卡訂單並重試（cron 呼叫）──────────────────
// 「卡住」＝ 已付款的 eSIM 訂單但尚未 COMPLETED：
//   (A) PAID 且 wmOrderId 為 null → placeWmOrder 曾失敗，需重新下單
//   (B) PAID 且 wmOrderId 有值但 callback 未到 → 主動 fetchEsimCodes 補完
// 兩種都交給 retryEsimActivation（內部依 wmOrderId 走對應路徑、且具冪等守門）。
// 退避：以 lastRetryAt 設兩次重試最小間隔；上限：retryCount 超過後停止自動重試、
// 改升級為人工告警，避免無止盡狂打世界移動。
export const ESIM_RETRY = {
  firstDelayMs: 3 * 60 * 1000,   // 付款後先給正常流程 3 分鐘，再介入重試
  gapMs: 10 * 60 * 1000,         // 兩次自動重試至少間隔 10 分鐘
  maxRetries: 6,                 // 連續失敗 6 次後停止自動重試、轉人工
}

export async function retryStuckEsimActivations(limit = 20): Promise<{
  scanned: number; retried: number; completed: number; exhausted: number
}> {
  const now = Date.now()
  const firstCutoff = new Date(now - ESIM_RETRY.firstDelayMs)
  const gapCutoff = new Date(now - ESIM_RETRY.gapMs)

  const candidates = await prisma.order.findMany({
    where: {
      // 與後台手動補發鈕相同的判定：付款成功但未發卡（PAID / 歷史 ESIM_PENDING）。
      status: { in: [OrderStatus.PAID, OrderStatus.ESIM_PENDING] },
      paidAt: { lt: firstCutoff },
      retryCount: { lt: ESIM_RETRY.maxRetries },
      OR: [{ lastRetryAt: null }, { lastRetryAt: { lt: gapCutoff } }],
      // 排除「已對供應商送出下單但結果未知」（有 claim、無 wmOrderId）：那批可能已在
      // 供應商端成立訂單，自動重試等於買第二張卡，必須留給人工對帳（見 P0-3）。
      NOT: { AND: [{ wmOrderId: null }, { supplierOrderClaimedAt: { not: null } }] },
    },
    orderBy: { paidAt: 'asc' },
    take: limit,
    select: { id: true, retryCount: true },
  })

  let retried = 0, completed = 0, exhausted = 0
  for (const o of candidates) {
    // 原子搶佔：只有把 retryCount 從目前值 +1 成功的那個 runner 才處理這筆，避免
    // 兩個 cron 實例同時重試同一張單而對世界移動重複下單（count===1 守門）。
    const claim = await prisma.order.updateMany({
      where: {
        id: o.id,
        retryCount: o.retryCount,
        status: { in: [OrderStatus.PAID, OrderStatus.ESIM_PENDING] },
      },
      data: { retryCount: { increment: 1 }, lastRetryAt: new Date() },
    })
    if (claim.count !== 1) continue   // 已被別的 runner 搶走或狀態已變 → 跳過
    retried++

    try {
      await retryEsimActivation(o.id)
    } catch (err) {
      await recordAlert('esim_retry_exception', {
        orderId: o.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    const after = await prisma.order.findUnique({ where: { id: o.id }, select: { status: true } })
    if (after?.status === OrderStatus.COMPLETED) {
      completed++
    } else if (o.retryCount + 1 >= ESIM_RETRY.maxRetries) {
      // 達上限仍未發卡 → 升級人工。只在「跨過上限」那一次發；之後該單因 retryCount
      // 不再 < maxRetries 而被排除，不會重複告警。
      exhausted++
      await recordAlert('esim_activation_exhausted', {
        orderId: o.id, retryCount: o.retryCount + 1, level: 'error',
      })
    }
  }

  return { scanned: candidates.length, retried, completed, exhausted }
}
