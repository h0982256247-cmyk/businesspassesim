'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import RefundConfirmDialog, { type RefundTarget } from '@/components/platform/RefundConfirmDialog'

type CouponLine = { coupon: { type: string; discount: number } }
type Commission = { commissionAmount: number; ownerRate: number; status: string } | null
type OrderItem = { productName: string; qty: number }
type Esim = {
  id: string
  orderNumber: string | null
  status: string
  bundleSeq: number | null
  subtotal: number
  discountAmount: number
  totalPaid: number
  orderItems: OrderItem[]
  orderCoupons: CouponLine[]
  commission: Commission
  esimRcode: string | null
  esimQrcode: string | null
  esimIccid: string | null
  activationStart: string | null
  activationEnd: string | null
  redeemedAt: string | null
  activatedAt: string | null
  wmOrderId: string | null
  wmOrderSn: string | null
  retryCount: number
  failureReason: string | null
}
type Detail = {
  orderNumber: string | null
  bundleId: string | null
  focusedId: string
  user: { displayName: string; lineUid: string; phone: string | null; email: string | null }
  payment: { paymentMethod: string; paidAt: string | null; createdAt: string; tapPayRecTradeId: string | null }
  esims: Esim[]
}

const STATUS: Record<string, { text: string; cls: string }> = {
  PENDING:      { text: '待付款',   cls: 'bg-yellow-50 text-yellow-600' },
  PROCESSING:   { text: '待付款',   cls: 'bg-yellow-50 text-yellow-600' },
  PAID:         { text: '已付款',   cls: 'bg-blue-50 text-blue-600' },
  COMPLETED:    { text: '已完成發送', cls: 'bg-green-50 text-green-600' },
  ESIM_PENDING: { text: '待發送',   cls: 'bg-orange-50 text-orange-600' },
  FAILED:       { text: '付款失敗', cls: 'bg-red-50 text-red-500' },
  CANCELLED:    { text: '已取消',   cls: 'bg-gray-100 text-gray-400' },
  REFUNDED:     { text: '已退款',   cls: 'bg-red-50 text-red-500' },
}
const COUPON_LABEL: Record<string, string> = {
  OFFICIAL_WELCOME: '官方歡迎券', GROUP_JOIN: '入群券', GROUP_REPURCHASE: '回購券',
  GROUP_OWNER: '社群主券', GROUP_ACTIVITY: '活動券',
}
const COMMISSION_STATUS: Record<string, string> = { SETTLED: '已結算', CANCELLED: '已取消', PENDING: '待結算' }
function fold(d: number) { const n = Math.round(d * 100); return n % 10 === 0 ? `${n / 10} 折` : `${n} 折` }
function dt(s: string | null) { return s ? new Date(s).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' }

function Pill({ status }: { status: string }) {
  const s = STATUS[status] ?? { text: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{s.text}
    </span>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); window.setTimeout(() => setDone(false), 1500) } catch { /* clipboard 不可用時略過 */ } }}
      className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
      title="複製"
    >
      {done
        ? <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="9" y="9" width="11" height="11" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" /></svg>}
    </button>
  )
}

const SecLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold text-gray-400 tracking-wide mb-2.5">{children}</p>
)
const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-gray-300">{children}</span>

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <div className="text-sm text-gray-800 break-all">{children}</div>
    </div>
  )
}

function KV({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className={`text-right break-all text-gray-700 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{children}</span>
    </div>
  )
}

export default function PlatformOrderDetail() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [refundTarget, setRefundTarget] = useState<RefundTarget | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/platform/orders/${id}`)
    if (r.status === 401) { router.replace('/platform/login'); return }
    const j = await r.json()
    if (j.esims) setD(j)
    setLoading(false)
  }, [id, router])
  useEffect(() => { load() }, [load])

  // 補發單張 eSIM（無金流風險，直接觸發；後端具冪等守門）
  const retry = async (orderId: string) => {
    setActingId(orderId); setMsg(null)
    const r = await fetch(`/api/platform/orders/${orderId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry_esim' }),
    }).then(x => x.json()).catch(() => ({ error: '連線失敗' }))
    setActingId(null)
    if (r.error) { setMsg({ ok: false, text: r.error }); return }
    setMsg({ ok: true, text: '已觸發補發流程，稍候重新整理查看' })
    load()
  }

  const REFUNDABLE = (s: string) => s === 'PAID' || s === 'COMPLETED' || s === 'ESIM_PENDING'
  const ACTIVE = (s: string) => !['REFUNDED', 'CANCELLED', 'FAILED'].includes(s)

  // 退款單張：抓該張預覽；判斷「退完後整捆是否全退」決定是否退券（只有全退才退券）。
  const openRefund = async (e: Esim) => {
    setActingId(e.id)
    const j = await fetch(`/api/platform/orders/${e.id}`).then(x => x.json()).catch(() => null)
    setActingId(null)
    const all = d?.esims ?? [e]
    const othersActive = all.some(x => x.id !== e.id && ACTIVE(x.status))
    setRefundTarget({
      id: e.id, orderNumber: e.orderNumber, status: e.status, scope: 'single',
      amount: e.totalPaid, count: 1,
      restoresCoupons: !othersActive,
      preview: j?.refundPreview ?? null,
    })
  }

  // 整捆退款：退所有仍可退的 eSIM、金額為合計，會退還／作廢優惠券。
  const openBundleRefund = async () => {
    if (!d) return
    const refundable = d.esims.filter(e => REFUNDABLE(e.status))
    if (refundable.length === 0) return
    setActingId('bundle')
    const j = await fetch(`/api/platform/orders/${d.focusedId}?scope=bundle`).then(x => x.json()).catch(() => null)
    setActingId(null)
    setRefundTarget({
      id: d.focusedId, orderNumber: d.orderNumber, status: refundable[0].status, scope: 'bundle',
      amount: refundable.reduce((s, e) => s + e.totalPaid, 0),
      count: refundable.length,
      restoresCoupons: true,
      preview: j?.refundPreview ?? null,
    })
  }

  const doRefund = async (t: RefundTarget): Promise<{ ok: boolean; message: string }> => {
    const r = await fetch(`/api/platform/orders/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: t.scope === 'bundle' ? 'refund_bundle' : 'refund' }),
    }).then(x => x.json()).catch(() => ({ error: '連線失敗' }))
    if (r.error) return { ok: false, message: r.error }
    const parts = [`已退還 NT$${(r.refundedAmount ?? 0).toLocaleString()}${r.refundedCount > 1 ? `（${r.refundedCount} 張 eSIM）` : ''}`]
    if (r.restoredCoupons > 0) parts.push(`歸還優惠券 ${r.restoredCoupons} 張`)
    if (r.voidedCoupons > 0) parts.push(`作廢回購券 ${r.voidedCoupons} 張`)
    load()
    return { ok: true, message: parts.join('\n') }
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">載入中…</div>
  if (!d) return <div className="p-8 text-center text-gray-400 text-sm">訂單不存在</div>

  const { user, payment } = d
  const esims = d.esims
  const isBundle = esims.length > 1
  const single = esims[0]
  const totalPaid = esims.reduce((s, e) => s + e.totalPaid, 0)
  const totalSubtotal = esims.reduce((s, e) => s + e.subtotal, 0)
  const totalDiscount = esims.reduce((s, e) => s + e.discountAmount, 0)
  const totalCommission = esims.reduce((s, e) => s + (e.commission?.commissionAmount ?? 0), 0)
  const hasCommission = esims.some(e => e.commission)
  const refundableCount = esims.filter(e => REFUNDABLE(e.status)).length

  const btn = {
    retry: 'bg-blue-600 hover:bg-blue-700 text-white',
    refundOutline: 'bg-white border border-red-200 text-red-600 hover:bg-red-50',
    refundSolid: 'bg-red-600 hover:bg-red-700 text-white',
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header：麵包屑 + 訂單號 + 狀態(單張) / 合購標籤 + 操作 */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <button onClick={() => router.push('/platform/orders')} className="text-gray-400 hover:text-gray-600 text-sm">← 訂單管理</button>
        <span className="text-gray-300">/</span>
        <h1 className="font-mono text-lg font-bold text-gray-800">{d.orderNumber ?? `#${d.focusedId.slice(-8).toUpperCase()}`}</h1>
        {isBundle
          ? <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">合購 · {esims.length} 張 eSIM</span>
          : <Pill status={single.status} />}
        <div className="ml-auto flex gap-2">
          {isBundle
            ? (refundableCount > 1 && (
                <button onClick={openBundleRefund} disabled={actingId === 'bundle'} className={`text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50 transition ${btn.refundSolid}`}>
                  {actingId === 'bundle' ? '處理中…' : `整捆退款（${refundableCount} 張）`}
                </button>
              ))
            : (
              <>
                {(single.status === 'PAID' || single.status === 'ESIM_PENDING') && (
                  <button onClick={() => retry(single.id)} disabled={actingId === single.id} className={`text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50 transition ${btn.retry}`}>
                    {actingId === single.id ? '處理中…' : '補發 eSIM'}
                  </button>
                )}
                {REFUNDABLE(single.status) && (
                  <button onClick={() => openRefund(single)} disabled={actingId === single.id} className={`text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-50 transition ${btn.refundOutline}`}>
                    退款
                  </button>
                )}
              </>
            )}
        </div>
      </div>
      {msg && <p className={`text-sm mb-4 ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* ── 左：eSIM 卡片 ── */}
        <div className="lg:col-span-2 space-y-4">
          {esims.map((e, i) => {
            const canRetry = e.status === 'PAID' || e.status === 'ESIM_PENDING'
            const canRefund = REFUNDABLE(e.status)
            const busy = actingId === e.id
            const pname = e.orderItems[0]?.productName ?? '—'
            const hasCred = !!e.esimRcode
            const installed = !!e.activationStart
            const hasInstall = !!(e.redeemedAt || e.activatedAt)
            return (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                {/* 卡頭 */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-50">
                  <div className="min-w-0">
                    {isBundle && (
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white bg-gray-900 rounded-md px-1.5 py-0.5">eSIM {i + 1}</span>
                        <Pill status={e.status} />
                      </div>
                    )}
                    <p className="text-base font-bold text-gray-800 truncate">{pname}</p>
                    {isBundle && e.orderNumber && <p className="text-xs text-gray-400 font-mono mt-0.5">{e.orderNumber}</p>}
                  </div>
                  {isBundle && (canRetry || canRefund) && (
                    <div className="flex gap-2 flex-shrink-0">
                      {canRetry && <button onClick={() => retry(e.id)} disabled={busy} className={`text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition ${btn.retry}`}>{busy ? '…' : '補發'}</button>}
                      {canRefund && <button onClick={() => openRefund(e)} disabled={busy} className={`text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition ${btn.refundOutline}`}>退款</button>}
                    </div>
                  )}
                </div>

                <div className="p-5 space-y-5">
                  {/* 開卡憑證 */}
                  <section>
                    <SecLabel>開卡憑證</SecLabel>
                    {hasCred ? (
                      <div className="rounded-xl bg-blue-50/40 border border-blue-100 p-4">
                        <p className="text-[11px] text-gray-400 mb-1">兌換碼 rcode</p>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-base font-bold text-gray-900 break-all select-all">{e.esimRcode}</code>
                          <CopyBtn text={e.esimRcode!} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-blue-100/70">
                          <div className="min-w-0">
                            <p className="text-[11px] text-gray-400 mb-1">ICCID</p>
                            {e.esimIccid
                              ? <div className="flex items-center gap-1.5"><code className="font-mono text-xs text-gray-700 break-all select-all">{e.esimIccid}</code><CopyBtn text={e.esimIccid} /></div>
                              : <Muted>—</Muted>}
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 mb-1">QR Code</p>
                            {e.esimQrcode
                              ? <a href={e.esimQrcode} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                  開啟 QR
                                </a>
                              : <Muted>—</Muted>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
                        <p className="text-sm text-gray-400">尚未開卡{e.status === 'PAID' ? '（可按「補發」觸發開卡）' : ''}</p>
                      </div>
                    )}
                  </section>

                  {/* 使用狀態 */}
                  <section>
                    <SecLabel>使用狀態</SecLabel>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <Field label="可用期間">{installed ? `${dt(e.activationStart)} ~ ${dt(e.activationEnd)}` : <Muted>尚未啟用</Muted>}</Field>
                      <Field label="開始安裝 / 啟用">{hasInstall ? `${e.redeemedAt ? dt(e.redeemedAt) : '—'} / ${e.activatedAt ? dt(e.activatedAt) : '—'}` : <Muted>尚未安裝</Muted>}</Field>
                    </div>
                  </section>

                  {/* 供應商 */}
                  <section>
                    <SecLabel>供應商（世界移動）</SecLabel>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <Field label="下單單號">{e.wmOrderId ? <span className="font-mono text-xs">{e.wmOrderId}</span> : <Muted>尚未下單</Muted>}</Field>
                      <Field label="eSIM 信件單號">{e.wmOrderSn ? <span className="font-mono text-xs">{e.wmOrderSn}</span> : <Muted>—</Muted>}</Field>
                      {e.retryCount > 0 && <Field label="補發重試">{e.retryCount} 次</Field>}
                    </div>
                  </section>

                  {e.failureReason && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <p className="text-xs font-semibold text-red-700">開卡 / 付款失敗原因</p>
                      <p className="text-sm text-red-600 mt-0.5">{e.failureReason}</p>
                    </div>
                  )}

                  {/* 合購時顯示此張金額拆解（單張的明細在右側摘要） */}
                  {isBundle && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-3 border-t border-gray-50 text-xs text-gray-500">
                      <span>實付 <b className="text-sm text-gray-900">NT${e.totalPaid.toLocaleString()}</b></span>
                      {e.discountAmount > 0 && <span>原價 NT${e.subtotal.toLocaleString()}・折 NT${e.discountAmount.toLocaleString()}</span>}
                      {e.orderCoupons.length > 0 && <span>{e.orderCoupons.map(c => `${COUPON_LABEL[c.coupon.type] ?? c.coupon.type}（${fold(c.coupon.discount)}）`).join('、')}</span>}
                      {e.commission && <span>分潤 NT${e.commission.commissionAmount}</span>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 右：訂單摘要（sticky）── */}
        <div className="lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {/* 會員 */}
            <div className="p-5">
              <SecLabel>會員</SecLabel>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">{user.displayName.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{user.displayName}</p>
                  <p className="text-[10px] text-gray-400 font-mono truncate">{user.lineUid}</p>
                </div>
              </div>
              <div className="space-y-2">
                <KV label="手機">{user.phone ?? <Muted>未填</Muted>}</KV>
                <KV label="Email">{user.email ?? <Muted>未填</Muted>}</KV>
              </div>
            </div>

            {/* 付款 */}
            <div className="p-5">
              <SecLabel>付款</SecLabel>
              <div className="space-y-2">
                <KV label="付款方式">{payment.paymentMethod === 'CREDIT_CARD' ? '信用卡' : 'LINE Pay'}</KV>
                <KV label="付款時間">{dt(payment.paidAt)}</KV>
                <KV label="建立時間">{dt(payment.createdAt)}</KV>
                {payment.tapPayRecTradeId && (
                  <div className="flex justify-between gap-3 items-start">
                    <span className="text-xs text-gray-400 flex-shrink-0">TapPay 交易號</span>
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="font-mono text-xs text-gray-700 break-all text-right">{payment.tapPayRecTradeId}</span>
                      <CopyBtn text={payment.tapPayRecTradeId} />
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 金額明細 */}
            <div className="p-5">
              <SecLabel>金額明細</SecLabel>
              <div className="space-y-2">
                <KV label="原價">NT${totalSubtotal.toLocaleString()}</KV>
                <KV label="折扣">- NT${totalDiscount.toLocaleString()}</KV>
                <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">{isBundle ? `合計實付（${esims.length} 張）` : '實付'}</span>
                  <span className="text-lg font-extrabold text-gray-900">NT${totalPaid.toLocaleString()}</span>
                </div>
                {!isBundle && single.orderCoupons.length > 0 && (
                  <KV label="使用優惠券">{single.orderCoupons.map(c => `${COUPON_LABEL[c.coupon.type] ?? c.coupon.type}（${fold(c.coupon.discount)}）`).join('、')}</KV>
                )}
                {hasCommission && (
                  <KV label="社群分潤">
                    NT${totalCommission.toLocaleString()}
                    {!isBundle && single.commission && <span className="text-gray-400">（{Math.round(Number(single.commission.ownerRate) * 100)}%・{COMMISSION_STATUS[single.commission.status] ?? single.commission.status}）</span>}
                  </KV>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <RefundConfirmDialog target={refundTarget} onClose={() => setRefundTarget(null)} onConfirm={doRefund} />
    </div>
  )
}
