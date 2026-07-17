import crypto from 'crypto'
import { Agent } from 'undici'
import { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { markOrderCompleted } from './order'
import { notifyEsimPending } from './notification'
import { recordAlert } from './alert'
import { getEsimConfig } from './tenant-config'
import { safeDecrypt } from '@/lib/utils/crypto'

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

async function getWmConfig(tenantAdminId?: string | null) {
  if (tenantAdminId) {
    const cfg = await getEsimConfig(tenantAdminId)  // token 已解密
    if (cfg && cfg.isActive) {
      return { apiUrl: cfg.apiUrl, merchantId: cfg.merchantId, deptId: cfg.deptId, token: cfg.token }
    }
    // 指定了租戶卻查無啟用設定 → 明確報錯，不退回平台全域 env（避免漏設定的白牌
    // 靜默用平台的世界移動帳號發卡）。env fallback 只給「無租戶」的單租戶/開發情境。
    throw new Error('此商店尚未設定 eSIM 供應商（世界移動），請至後台「eSIM 設定」填寫')
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

async function wmPost(endpoint: string, payload: object, tenantAdminId?: string | null): Promise<unknown> {
  const { apiUrl, merchantId, deptId, token } = await getWmConfig(tenantAdminId)
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

async function fetchEsimCodes(wmOrderId: string, tenantAdminId?: string | null): Promise<WmEsimResult | null> {
  try {
    const data = await wmPost('/api/order/esim/query', { orderId: wmOrderId }, tenantAdminId) as Record<string, unknown>

    if (!data || data.code !== '0000') return null

    const item = (data.data as Record<string, unknown>[] | undefined)?.[0]
    if (!item) return null

    return {
      wmOrderId,
      wmOrderSn: item.orderSn as string | undefined,
      wmOrderTime: item.orderTime as string | undefined,
      esimRcode: item.rCode as string | undefined,
      esimQrcode: item.qrCode as string | undefined,
      esimLpa: item.lpa as string | undefined,
      esimPin1: item.pin1 as string | undefined,
      esimPin2: item.pin2 as string | undefined,
      esimPuk1: item.puk1 as string | undefined,
      esimPuk2: item.puk2 as string | undefined,
      esimCfCode: item.cfCode as string | undefined,
      esimApnExplain: item.apnExplain as string | undefined,
      esimIccid: item.iccid as string | undefined,
      activationStart: item.activationStart ? new Date(item.activationStart as string) : undefined,
      activationEnd: item.activationEnd ? new Date(item.activationEnd as string) : undefined,
    }
  } catch {
    return null
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

async function placeWmOrder(orderId: string, tenantAdminId?: string | null): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: { include: { product: { include: { supplierProduct: true } } } },
      user:       { select: { lineUid: true, email: true } },
    },
  })
  if (!order || !order.orderItems[0]) {
    await recordAlert('wm_order_no_item', { orderId, tenantAdminId })
    return null
  }

  const item = order.orderItems[0]
  const wmproductId = item.product.supplierProduct?.wmProductId
  if (!wmproductId) {
    // 商品沒對到世界移動 wmProductId（如假 SKU / 未同步）→ 付款成功卻開不了卡，必須告警
    await recordAlert('wm_order_no_wmproductid', { orderId, tenantAdminId, productId: item.productId })
    return null
  }

  // 取用戶 email（可能加密）；沒有就用 lineUid 組 placeholder（systemMail=false 不會真的寄）
  const rawEmail = order.user.email
  const email = rawEmail
    ? safeDecrypt(rawEmail)
    : `${order.user.lineUid}@noreply.local`

  const { apiUrl, merchantId, deptId, token } = await getWmConfig(tenantAdminId)
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
    if (!res.ok || !data || data.code !== 0) {
      // 付款成功卻 WM 下單失敗（最該被看到的狀況）→ 告警，後台儀表板會跳紅
      await recordAlert('wm_order_failed', {
        orderId, tenantAdminId, wmProductId: wmproductId,
        httpStatus: res.status,
        wmCode: data?.code ?? null,
        wmMsg: (data?.msg ?? data?.message ?? null) as string | null,
      })
      return null
    }
    return (data.orderId as string) ?? null
  } catch (err) {
    await recordAlert('wm_order_exception', {
      orderId, tenantAdminId, wmProductId: wmproductId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─── 觸發兌換（3.1 兌換兌換碼）— 用戶按「我要安裝」時呼叫 ────────────────

export async function triggerEsimRedemption(orderId: string): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true,
      esimRcode: true, esimQrcode: true,
      redeemedAt: true, activatedAt: true,
      user: {
        select: {
          tenantAdminId: true,
          groupMembership: { select: { group: { select: { tenantAdminId: true } } } },
          ownedGroup:      { select: { tenantAdminId: true } },
        },
      },
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

  // 直接租戶用戶（user.tenantAdminId）優先；社群成員/社群主再 fallback。
  // 過去只看 group → 非社群的一般租戶用戶 tenantAdminId 永遠 null、getWmConfig
  // 找不到租戶 WM 設定 → placeWmOrder throw、eSIM 發不出。與 payment-config 一致。
  const tenantAdminId = order.user.tenantAdminId
    ?? order.user.groupMembership?.group.tenantAdminId
    ?? order.user.ownedGroup?.tenantAdminId
    ?? null

  const { apiUrl, merchantId, token } = await getWmConfig(tenantAdminId)
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

    // 標記 redeemedAt（鎖死轉贈；3.2 callback 之後會補上 QR/LPA）
    // 同時若有 pending 未領取的 gift 自動取消（避免領了卻領到已 redeem 的卡）
    const now = new Date()
    await prisma.$transaction(async tx => {
      await tx.order.update({
        where: { id: orderId },
        data: { redeemedAt: now },
      })
      await tx.orderGift.updateMany({
        where: { orderId, claimedAt: null, cancelledAt: null },
        data: { cancelledAt: now, cancelReason: 'buyer_redeemed' },
      })
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : '兌換失敗' }
  }
}

// ─── 主流程：付款後觸發下單（PUSH 模式，不再 polling）─────────────

export async function triggerEsimActivation(orderId: string): Promise<void> {
  const orderInfo = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      wmOrderId: true,
      orderItems: { select: { productName: true } },
      user: {
        select: {
          tenantAdminId: true,
          groupMembership: { select: { group: { select: { tenantAdminId: true } } } },
          ownedGroup: { select: { tenantAdminId: true } },
        },
      },
    },
  })
  // 冪等守門：已下過供應商單（wmOrderId 已存在）就直接略過，避免並發 webhook /
  // webhook 重送對世界移動重複下單（重複成本、重複發卡）。wmOrderId 為 null 才是
  // 「尚未下單或前次下單失敗」，允許（重）試。
  if (orderInfo?.wmOrderId) return
  const userId = orderInfo?.userId ?? ''
  const productName = orderInfo?.orderItems[0]?.productName ?? 'eSIM'
  // 直接租戶用戶優先（見 triggerEsimRedemption 同款修正）
  const tenantAdminId = orderInfo?.user?.tenantAdminId
    ?? orderInfo?.user?.groupMembership?.group?.tenantAdminId
    ?? orderInfo?.user?.ownedGroup?.tenantAdminId
    ?? null

  // 只負責下單，等 WM 推 2.5 callback 完成餘下流程
  const wmOrderId = await placeWmOrder(orderId, tenantAdminId)
  if (!wmOrderId) {
    // 下單失敗：訂單維持 PAID（付款成功但尚未發卡），不再轉成 ESIM_PENDING。
    // ⚠ 不要靜默：印出 log（Vercel 可見），訂單留在「PAID 且無 esimRcode」可被
    // retry cron / 後台補發撈到。這段過去靜默吞錯，是「付款成功卻沒收到 eSIM」
    // 最難 debug 的主因。
    console.error('[esim] placeWmOrder 失敗，訂單維持 PAID 待重試', { orderId })
    notifyEsimPending(userId, productName, tenantAdminId).catch(() => {})
    return
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { wmOrderId },
  })
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

export async function queryEsimUsage(iccid: string, tenantAdminId?: string | null): Promise<EsimUsage | null> {
  try {
    const data = await wmPost('/api/esim/usage', { iccid }, tenantAdminId) as Record<string, unknown>
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
export async function fetchSupplierProductMap(tenantAdminId?: string | null): Promise<SupplierProductMap> {
  const { apiUrl, merchantId, token } = await getWmConfig(tenantAdminId)
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
    select: {
      wmOrderId: true,
      user: {
        select: {
          tenantAdminId: true,
          groupMembership: { select: { group: { select: { tenantAdminId: true } } } },
          ownedGroup: { select: { tenantAdminId: true } },
        },
      },
    },
  })

  if (order?.wmOrderId) {
    // 直接租戶用戶優先（否則 fetchEsimCodes 走 env fallback、找不到租戶 WM 設定）
    const tenantAdminId = order.user?.tenantAdminId
      ?? order.user?.groupMembership?.group?.tenantAdminId
      ?? order.user?.ownedGroup?.tenantAdminId
      ?? null
    const esimData = await fetchEsimCodes(order.wmOrderId, tenantAdminId)
    if (esimData) {
      await markOrderCompleted(orderId, esimData)
      return
    }
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
    },
    orderBy: { paidAt: 'asc' },
    take: limit,
    select: { id: true, retryCount: true, user: { select: { tenantAdminId: true } } },
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

    const tenantAdminId = o.user?.tenantAdminId ?? null
    try {
      await retryEsimActivation(o.id)
    } catch (err) {
      await recordAlert('esim_retry_exception', {
        orderId: o.id, tenantAdminId,
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
        orderId: o.id, tenantAdminId, retryCount: o.retryCount + 1, level: 'error',
      })
    }
  }

  return { scanned: candidates.length, retried, completed, exhausted }
}

