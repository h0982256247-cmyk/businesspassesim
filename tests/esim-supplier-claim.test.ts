import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// P0-3：同一張 Local Order，在任何並發情況下最多只能對世界移動產生一個供應商訂單。
//
// 舊行為：triggerEsimActivation 先 SELECT wmOrderId、看到 null 就呼叫供應商、事後才寫回，
// 是典型的 read-then-act，不是鎖。付款 webhook、同步付款、cron、後台補發四個入口都
// 直接進這一支，任兩個並發就會各買一張卡（真實成本 + 重複發卡）。
//
// 本測試用「行為與 DB 條件式更新一致」的假 prisma：updateMany 只有在 where 條件仍
// 成立時才寫入並回 count=1，兩個並發 worker 只會有一個搶到 claim。再用 Promise.all
// 模擬真正並發，斷言 mybuyesim（2.1 下單）只被呼叫一次。
vi.mock('@/lib/db/prisma', () => ({
  prisma: { order: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('@/lib/services/tenant-config', () => ({ getEsimConfig: vi.fn() }))
vi.mock('@/lib/services/order', () => ({ markOrderCompleted: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/services/notification', () => ({ notifyEsimPending: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/services/alert', () => ({ recordAlert: vi.fn(() => Promise.resolve()) }))

import {
  triggerEsimActivation, retryEsimActivation, retryStuckEsimActivations,
} from '@/lib/services/esim'
import { prisma } from '@/lib/db/prisma'
import { getEsimConfig } from '@/lib/services/tenant-config'
import { notifyEsimPending } from '@/lib/services/notification'
import { recordAlert } from '@/lib/services/alert'

const CFG = { apiUrl: 'https://tfmshippingsys.fastmove.com.tw', merchantId: 'M1', deptId: 'D1', token: 'TOK', isActive: true }

type Row = Record<string, unknown>

const makeRow = (o: Row = {}): Row => ({
  id: 'oA', userId: 'u1', status: 'PAID',
  wmOrderId: null, supplierOrderClaimedAt: null,
  retryCount: 0, lastRetryAt: null, paidAt: new Date(),
  orderItems: [{ productId: 'p1', qty: 1, productName: '日本 3天', product: { supplierProduct: { wmProductId: 'WM_000001' } } }],
  user: { lineUid: 'U1', email: null },
  ...o,
})

// ─── 假 prisma：語意比照 PostgreSQL 的條件式 UPDATE ─────────────────
let rows: Map<string, Row>
let failWmOrderIdWrite = false

function whereMatches(row: Row, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'id') { if (row.id !== v) return false; continue }
    if (v === null) { if (row[k] != null) return false; continue }
    if (v && typeof v === 'object') {
      const cond = v as Record<string, unknown>
      if ('in' in cond) { if (!(cond.in as unknown[]).includes(row[k])) return false; continue }
      if ('not' in cond) {
        if (cond.not === null) { if (row[k] == null) return false; continue }
        if (row[k] === cond.not) return false
        continue
      }
    }
    if (row[k] !== v) return false
  }
  return true
}

function applyData(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
      row[k] = (row[k] as number) + ((v as { increment: number }).increment)
    } else {
      row[k] = v
    }
  }
}

// ─── 假世界移動 ────────────────────────────────────────────────────
let wmOrderCalls = 0
let wmQueryCalls = 0
let wmOrderResponse: { throws?: boolean; ok?: boolean; body?: Record<string, unknown> }

const setupFetch = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const u = String(url)
  if (u.includes('/Api/SOrder/mybuyesim')) {
    wmOrderCalls++
    if (wmOrderResponse.throws) throw new Error('socket hang up')
    return { ok: wmOrderResponse.ok ?? true, status: wmOrderResponse.ok === false ? 502 : 200, json: async () => wmOrderResponse.body }
  }
  if (u.includes('/Api/SOrder/querybuyesim')) {
    wmQueryCalls++
    return { ok: true, status: 200, json: async () => ({ code: 0, itemList: [{ redemptionCode: 'RC1', iccid: 'IC1' }] }) }
  }
  throw new Error(`unexpected fetch: ${u}`)
}))

beforeEach(() => {
  vi.clearAllMocks()
  rows = new Map([['oA', makeRow()]])
  failWmOrderIdWrite = false
  wmOrderCalls = 0
  wmQueryCalls = 0
  wmOrderResponse = { ok: true, body: { code: 0, orderId: 'WM-1' } }
  vi.mocked(getEsimConfig).mockResolvedValue(CFG as never)
  vi.mocked(prisma.order.findUnique).mockImplementation((async ({ where }: { where: { id: string } }) =>
    rows.get(where.id) ?? null) as never)
  vi.mocked(prisma.order.findMany).mockImplementation((async () => []) as never)
  vi.mocked(prisma.order.updateMany).mockImplementation((async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const row = rows.get(where.id as string)
    if (!row || !whereMatches(row, where)) return { count: 0 }
    // 模擬「供應商已成功、但寫回 DB 失敗」：只讓寫 wmOrderId 那一次爆掉
    if (failWmOrderIdWrite && 'wmOrderId' in data && data.wmOrderId != null) {
      throw new Error('DB write failed')
    }
    applyData(row, data)
    return { count: 1 }
  }) as never)
  setupFetch()
})
afterEach(() => vi.unstubAllGlobals())

describe('P0-3 供應商下單原子搶佔 — 並發只能有一張供應商訂單', () => {
  it('兩個並發 activation → 只有一個 worker 搶到，mybuyesim 只被呼叫一次', async () => {
    await Promise.all([triggerEsimActivation('oA'), triggerEsimActivation('oA')])

    expect(wmOrderCalls).toBe(1)
    expect(rows.get('oA')!.wmOrderId).toBe('WM-1')
  })

  it('五個並發 activation → mybuyesim 仍只被呼叫一次', async () => {
    await Promise.all(Array.from({ length: 5 }, () => triggerEsimActivation('oA')))

    expect(wmOrderCalls).toBe(1)
  })

  it('付款 webhook 與 cron 重試同時觸發 → 只下一次供應商單', async () => {
    vi.mocked(prisma.order.findMany).mockImplementation((async () => [{ id: 'oA', retryCount: 0 }]) as never)

    await Promise.all([triggerEsimActivation('oA'), retryStuckEsimActivations()])

    expect(wmOrderCalls).toBe(1)
  })

  it('付款 webhook 與後台手動補發同時觸發 → 只下一次供應商單', async () => {
    await Promise.all([triggerEsimActivation('oA'), retryEsimActivation('oA')])

    expect(wmOrderCalls).toBe(1)
  })

  it('已有 wmOrderId → 完全不呼叫供應商', async () => {
    rows.set('oA', makeRow({ wmOrderId: 'WM-EXISTING' }))

    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(0)
    expect(rows.get('oA')!.wmOrderId).toBe('WM-EXISTING')
  })

  it('搶輸的 worker 不可被當成「下單失敗」（不推補發中通知、不記下單失敗告警）', async () => {
    await Promise.all([triggerEsimActivation('oA'), triggerEsimActivation('oA')])

    expect(wmOrderCalls).toBe(1)
    expect(notifyEsimPending).not.toHaveBeenCalled()
    expect(recordAlert).not.toHaveBeenCalledWith('wm_order_failed', expect.anything())
  })

  it('訂單已退款 → 狀態不允許下單，claim 失敗、不呼叫供應商', async () => {
    rows.set('oA', makeRow({ status: 'REFUNDED' }))

    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(0)
    expect(rows.get('oA')!.supplierOrderClaimedAt).toBeNull()
  })

  it('供應商明確拒絕（code 非 0）→ 釋放 claim，之後可安全重試', async () => {
    wmOrderResponse = { ok: true, body: { code: 500, msg: '庫存不足' } }
    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(1)
    expect(rows.get('oA')!.supplierOrderClaimedAt).toBeNull()   // 確定沒買到 → 可重試
    expect(recordAlert).toHaveBeenCalledWith('wm_order_failed', expect.objectContaining({ orderId: 'oA' }))

    wmOrderResponse = { ok: true, body: { code: 0, orderId: 'WM-2' } }
    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(2)
    expect(rows.get('oA')!.wmOrderId).toBe('WM-2')
  })

  it('商品沒對到供應商 SKU（根本沒打過供應商）→ 釋放 claim', async () => {
    rows.set('oA', makeRow({
      orderItems: [{ productId: 'p1', qty: 1, productName: 'X', product: { supplierProduct: null } }],
    }))

    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(0)
    expect(rows.get('oA')!.supplierOrderClaimedAt).toBeNull()
    expect(recordAlert).toHaveBeenCalledWith('wm_order_no_wmproductid', expect.objectContaining({ orderId: 'oA' }))
  })
})

// ─── Unknown Outcome：供應商可能已經建立訂單，但我們不知道 ──────────────
// 這一組的共同要求：claim 必須保留，系統不可自動再下一張。
describe('P0-3 Unknown Outcome — 供應商可能已成立，一律不得自動重下單', () => {
  it('供應商回成功但 DB 寫入失敗 → 保留 claim、記錄可對帳的告警、不再自動下單', async () => {
    failWmOrderIdWrite = true

    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(1)
    // claim 仍在（wmOrderId 仍為 null，但已標記為「下單中／結果未知」）
    expect(rows.get('oA')!.supplierOrderClaimedAt).not.toBeNull()
    expect(rows.get('oA')!.wmOrderId).toBeNull()
    // 告警要帶上供應商訂單編號，人工才對得起來
    expect(recordAlert).toHaveBeenCalledWith('wm_order_unknown_outcome', expect.objectContaining({
      orderId: 'oA', wmOrderId: 'WM-1',
    }))

    // 關鍵：之後任何入口都不可再買第二張
    failWmOrderIdWrite = false
    await triggerEsimActivation('oA')
    await retryEsimActivation('oA')
    expect(wmOrderCalls).toBe(1)
  })

  it('連線逾時（供應商可能已建立訂單）→ 保留 claim、不自動重下單', async () => {
    wmOrderResponse = { throws: true }

    await triggerEsimActivation('oA')

    expect(wmOrderCalls).toBe(1)
    expect(rows.get('oA')!.supplierOrderClaimedAt).not.toBeNull()
    expect(recordAlert).toHaveBeenCalledWith('wm_order_unknown_outcome', expect.objectContaining({ orderId: 'oA' }))

    await triggerEsimActivation('oA')
    expect(wmOrderCalls).toBe(1)
  })

  it('HTTP 錯誤且無可解析內容（可能是 proxy 逾時）→ 視為未知，保留 claim', async () => {
    wmOrderResponse = { ok: false, body: undefined }

    await triggerEsimActivation('oA')

    expect(rows.get('oA')!.supplierOrderClaimedAt).not.toBeNull()
    await triggerEsimActivation('oA')
    expect(wmOrderCalls).toBe(1)
  })

  it('供應商回 code=0 卻沒有 orderId → 視為未知，保留 claim', async () => {
    wmOrderResponse = { ok: true, body: { code: 0 } }

    await triggerEsimActivation('oA')

    expect(rows.get('oA')!.supplierOrderClaimedAt).not.toBeNull()
    await triggerEsimActivation('oA')
    expect(wmOrderCalls).toBe(1)
  })

  it('停在「下單中／結果未知」的訂單：後台補發不可自動重下單，也不可拿 claim 當供應商編號去查詢', async () => {
    rows.set('oA', makeRow({ supplierOrderClaimedAt: new Date(Date.now() - 60 * 60 * 1000) }))

    await retryEsimActivation('oA')

    expect(wmOrderCalls).toBe(0)
    expect(wmQueryCalls).toBe(0)
    expect(recordAlert).toHaveBeenCalledWith('wm_order_claim_stuck', expect.objectContaining({ orderId: 'oA' }))
  })

  it('cron 掃描條件必須排除「下單中／結果未知」的訂單（不燒 retryCount、不重複告警）', async () => {
    await retryStuckEsimActivations()

    const where = vi.mocked(prisma.order.findMany).mock.calls[0][0]!.where as Record<string, unknown>
    expect(JSON.stringify(where)).toContain('supplierOrderClaimedAt')
  })
})
