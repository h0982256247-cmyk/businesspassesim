'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTapPaySdkLoader } from '@/hooks/useTapPaySdkLoader'
import { useLiffBase } from '@/hooks/useLiffBase'
import { redirectToPaymentUrl } from '@/lib/utils/payment-redirect'
import { useTenantColors } from '@/components/liff/TenantContext'
import { useLiff } from '@/components/liff/LiffProvider'
import { findBestCouponCombo as _findBestCouponCombo } from '@/lib/utils/coupon-combo'
import { CountryFlag } from '@/components/common/CountryFlag'
import { useCart } from '@/components/liff/CartProvider'
import { NetworkBadge, NativeSimBadge } from '@/components/liff/ProductBadges'

declare global {
  interface Window {
    TPDirect: {
      setupSDK: (appId: number, appKey: string, env: string) => void
      card: {
        setup: (config: object) => void
        getPrime: (callback: (result: { status: number; card: { prime: string }; msg: string }) => void) => void
        getTappayFieldsStatus: () => { canGetPrime: boolean }
      }
      linePay: {
        getPrime: (callback: (result: { status?: number; prime: string; msg?: string }) => void) => void
      }
      redirect: (url: string) => void
    }
  }
}

type Product = {
  id: string
  countryCode: string
  countryNameZh: string
  countryFlag: string | null
  displayDays: number
  sellPrice: number
  dataCapacity: string | null
  networkType: string | null
  isNativeSim: boolean
}

type Coupon = {
  id: string
  type: string
  level: string
  discount: number
  expiresAt: string | null
}

type SavedCard = {
  lastFour: string
  cardType: number
  cardTypeLabel: string
  expiresAt: string | null
}

const TYPE_LABEL: Record<string, string> = {
  OFFICIAL_WELCOME: '歡迎券',
  GROUP_JOIN:       '入群券',
  GROUP_REPURCHASE: '回購券',
  GROUP_OWNER:      '社群主專屬',
  GROUP_ACTIVITY:   '活動券',
}

// 使用共用版本
const findBestCouponCombo = _findBestCouponCombo

// 多張結帳：把總折扣按各筆原價比例攤回每一張（最大餘數法，與後端 allocateDiscountByWeight
// 同邏輯），讓上方每張預覽也能顯示折後價；加總必等於總折扣。
function allocateLineDiscounts(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0 || total <= 0) return weights.map(() => 0)
  const raw = weights.map(w => (total * w) / sum)
  const floored = raw.map(Math.floor)
  const remainder = total - floored.reduce((a, b) => a + b, 0)
  const byFrac = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac)
  const result = [...floored]
  for (let k = 0; k < remainder && k < byFrac.length; k++) result[byFrac[k].i]++
  return result
}

function TicketIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function CreditCardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function LinePayIcon() {
  // LINE 綠底白色對話框 Logo
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: 7, background: '#06C755', flexShrink: 0,
    }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" aria-label="LINE Pay">
        <path d="M12 2.5C6.2 2.5 1.5 6.27 1.5 10.9c0 4.15 3.73 7.62 8.77 8.28.34.07.8.22.92.51.1.26.07.67.03.94l-.14.85c-.05.26-.21 1.03.9.56 1.11-.47 5.98-3.52 8.16-6.03 1.5-1.65 2.22-3.32 2.22-5.16 0-4.63-4.7-8.4-10.36-8.4zM8.05 13.2H6.1a.26.26 0 0 1-.26-.26V9.06a.26.26 0 0 1 .52 0v3.62h1.69a.26.26 0 0 1 0 .52zm1.02-.26a.26.26 0 0 1-.52 0V9.06a.26.26 0 0 1 .52 0v3.88zm4.3 0a.26.26 0 0 1-.18.25h-.08a.26.26 0 0 1-.21-.1l-1.99-2.71v2.56a.26.26 0 0 1-.52 0V9.06a.26.26 0 0 1 .47-.15l2 2.71V9.06a.26.26 0 0 1 .52 0v3.88zm2.65-2.2a.26.26 0 0 1 0 .52h-1.69v1.16h1.69a.26.26 0 0 1 0 .52h-1.95a.26.26 0 0 1-.26-.26V9.06a.26.26 0 0 1 .26-.26h1.95a.26.26 0 0 1 0 .52h-1.69v1.16h1.69z"/>
      </svg>
    </span>
  )
}

function CardTypeBadge({ type }: { type: number }) {
  const labels: Record<number, string> = { 1: 'VISA', 2: 'MC', 3: 'JCB', 4: 'UP', 5: 'AMEX' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 36, height: 24, borderRadius: 4,
      background: type === 1 ? '#1a1f71' : type === 2 ? '#eb001b' : '#006fba',
      fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.03em',
    }}>
      {labels[type] ?? 'CARD'}
    </span>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ width: 28, height: 28, border: '2.5px solid #fde68a', borderTopColor: '#FFC107', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get('productId')
  // 沒有 productId → 多張（購物車）結帳模式
  const bundleMode = !productId
  const C = useTenantColors()
  // /liff/<slug>/... 進來的話 base = '/liff/<slug>'；舊版 (liff) 直接是 ''。
  // returnUrl 給 TapPay 一定要帶 base，不然 3DS / LINE Pay 完成後跳轉會掉
  // 掉 slug 前綴，使用者回到的訂單頁不在他原本的租戶介面下。
  const base = useLiffBase()
  const cart = useCart()
  const { liff } = useLiff()

  const [product, setProduct] = useState<Product | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [selectedCouponIds, setSelectedCouponIds] = useState<string[]>([])
  const [autoSelectedIds, setAutoSelectedIds] = useState<string[]>([])  // 記錄自動帶入的組合
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT_CARD' | 'LINE_PAY'>('CREDIT_CARD')
  // 平台商可在後台關閉某支付；關閉者前台不顯示。預設兩者皆開（env fallback / 尚未載入時）。
  const [methods, setMethods] = useState<{ creditCard: boolean; linePay: boolean }>({ creditCard: true, linePay: true })
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [comboError, setComboError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null)  // null = 載入中

  // ── TapPay 信用卡（內嵌於本頁，按「確認付款」直接發動交易）──
  const [savedCard, setSavedCard] = useState<SavedCard | null | undefined>(undefined)
  const [useNewCard, setUseNewCard] = useState(false)
  const [remember, setRemember] = useState(true)
  const sdkLoaded = useTapPaySdkLoader()
  const [sdkReady, setSdkReady] = useState(false)
  const [canPay, setCanPay] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // TapPay 前端設定要用 state（非 ref）：config 由 /api/liff/payment-config 非同步
  // 取回，若存進 ref 則到貨時不會觸發 re-render，initTapPay 的 effect 不會重跑，
  // 一旦它在 config 到貨前先跑過一次（appId=0 → ensureSetup 回 false、跳過
  // card.setup）信用卡欄位就永遠初始化不了、無法填寫。改 state 後 config 一到
  // 就重跑 effect 並成功 setup。
  const [tapPayConfig, setTapPayConfig] = useState<{ appId: number; appKey: string; env: string } | null>(null)
  const setupDoneRef = useRef(false)

  // 單張：商品 + 優惠券一起載入，並用商品原價自動帶入最優惠組合
  useEffect(() => {
    if (bundleMode) { setLoading(false); return }
    if (!productId) return
    Promise.all([
      fetch(`/api/products/${productId}`).then(r => r.json()),
      fetch('/api/coupons').then(r => r.json()),
    ]).then(([pd, cd]) => {
      const prod: Product | null = pd.product ?? null
      setProduct(prod)
      const now = new Date()
      const validCoupons: Coupon[] = (cd.coupons ?? []).filter((c: Coupon) =>
        !('usedAt' in c && (c as { usedAt: string | null }).usedAt) &&
        (!c.expiresAt || new Date(c.expiresAt) > now)
      )
      setCoupons(validCoupons)
      if (prod && validCoupons.length > 0) {
        const best = findBestCouponCombo(validCoupons, prod.sellPrice)
        setSelectedCouponIds(best)
        setAutoSelectedIds(best)
      }
    }).finally(() => setLoading(false))
  }, [productId, bundleMode])

  // 購物車（多張）：載入優惠券，並用「整筆總額」自動帶入最優惠組合（折總額）
  useEffect(() => {
    if (!bundleMode || !cart.hydrated) return
    const base = cart.subtotal
    fetch('/api/coupons').then(r => r.json()).then(cd => {
      const now = new Date()
      const validCoupons: Coupon[] = (cd.coupons ?? []).filter((c: Coupon) =>
        !('usedAt' in c && (c as { usedAt: string | null }).usedAt) &&
        (!c.expiresAt || new Date(c.expiresAt) > now)
      )
      setCoupons(validCoupons)
      if (validCoupons.length > 0 && base > 0) {
        const best = findBestCouponCombo(validCoupons, base)
        setSelectedCouponIds(best)
        setAutoSelectedIds(best)
      }
    }).catch(() => {})
  }, [bundleMode, cart.hydrated, cart.subtotal])

  // 載入已儲存卡片
  useEffect(() => {
    fetch('/api/payment/saved-card')
      .then(r => r.json())
      .then(d => setSavedCard(d.savedCard ?? null))
      .catch(() => setSavedCard(null))
  }, [])

  // 結帳前需完成基本資料；未完成則把「確認付款」換成「前往填寫」。
  // 後端 /api/orders(/bundle) 也會擋（PROFILE_INCOMPLETE），這裡只是提前提示。
  // 取值失敗時預設 true（不擋），交給後端把關。
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => setProfileComplete(d?.user?.profileComplete ?? true))
      .catch(() => setProfileComplete(true))
  }, [])

  // 沒有已儲存卡片 → 直接顯示輸入欄位
  useEffect(() => {
    if (savedCard === null) setUseNewCard(true)
  }, [savedCard])

  // 取得 TapPay 前端設定（app_id / app_key / env）
  useEffect(() => {
    async function fetchConfig() {
      try {
        const profile = liff ? await liff.getProfile().catch(() => null) : null
        const lineUid = profile?.userId ?? ''
        // 若走 /liff/<slug>/checkout 路由，從 pathname 抽出 slug 帶上，桌面測試
        // （無 LINE 登入）也能讓後端 resolve 出正確 tenant 的 TapPay 設定。
        const slugMatch = typeof window !== 'undefined'
          ? window.location.pathname.match(/^\/liff\/([^/]+)/)
          : null
        const tenantSlug = slugMatch?.[1] ?? ''
        const params = new URLSearchParams()
        if (lineUid) params.set('lineUid', lineUid)
        if (tenantSlug) params.set('tenantSlug', tenantSlug)
        const qs = params.toString()
        const url = qs ? `/api/liff/payment-config?${qs}` : '/api/liff/payment-config'
        const res = await fetch(url).then(r => r.json())
        setTapPayConfig(res)
        if (res?.methods) setMethods(res.methods)
      } catch { /* fallback handled server-side */ }
    }
    fetchConfig()
  }, [liff])

  // 若目前選的支付被平台商關閉，自動切到另一個可用的支付
  useEffect(() => {
    if (paymentMethod === 'CREDIT_CARD' && !methods.creditCard && methods.linePay) setPaymentMethod('LINE_PAY')
    else if (paymentMethod === 'LINE_PAY' && !methods.linePay && methods.creditCard) setPaymentMethod('CREDIT_CARD')
  }, [methods, paymentMethod])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const showCardForm = useNewCard || savedCard === null

  // setupSDK 只需呼叫一次（信用卡與 LINE Pay 共用）。
  // 回傳 true = 真的有效設定；回傳 false = appId 為 0（後端沒給 tenant 設定），
  // 呼叫端必須立即報錯給使用者，不要繼續呼叫 card.setup（會炸 contentWindow）。
  const ensureSetup = (): boolean => {
    if (setupDoneRef.current) return true
    const cfg = tapPayConfig
    const appId = cfg?.appId ?? parseInt(process.env.NEXT_PUBLIC_TAPPAY_APP_ID ?? '0')
    const appKey = cfg?.appKey ?? process.env.NEXT_PUBLIC_TAPPAY_APP_KEY ?? ''
    const env = cfg?.env ?? (process.env.NEXT_PUBLIC_TAPPAY_ENV === 'production' ? 'production' : 'sandbox')
    if (!appId || !appKey) {
      console.error('[checkout] TapPay config missing (appId=0). 後端 /api/liff/payment-config 未提供 tenant 設定。')
      return false
    }
    window.TPDirect.setupSDK(appId, appKey, env)
    setupDoneRef.current = true
    return true
  }

  const initTapPay = () => {
    if (!ensureSetup()) return  // 沒設定就不要設 fields，否則 SDK 內部會炸
    window.TPDirect.card.setup({
      fields: {
        number:         { element: '#card-number', placeholder: '1234 5678 9012 3456' },
        expirationDate: { element: '#card-expiry', placeholder: 'MM / YY' },
        ccv:            { element: '#card-ccv',    placeholder: 'CVV' },
      },
      // styles 屬性會被注入到 iframe 內部 input；用 -apple-system 在 LINE iOS
      // webview 才會抓到系統字、跟外層 UI 一致。height + line-height 讓文字
      // 垂直置中、不會落到 box 下緣（之前 placeholder 跑出灰框的根因）。
      styles: {
        input: {
          color: '#1a1a1a',
          'font-size': '16px',
          'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          'font-weight': '500',
          'line-height': '24px',
        },
        'input.ccv': { 'letter-spacing': '2px' },
        ':focus':    { color: '#1a1a1a' },
        '.valid':    { color: '#059669' },
        '.invalid':  { color: '#dc2626' },
        '::placeholder': { color: '#94a3b8' },
      },
    })
    setSdkReady(true)

    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      setCanPay(window.TPDirect.card.getTappayFieldsStatus().canGetPrime)
    }, 500)
  }

  // SDK 載入完成 + 頁面就緒 + 卡號欄位已渲染時才初始化，避免 setup 找不到元素
  useEffect(() => {
    const pageReady = bundleMode ? cart.hydrated : (!loading && !!product)
    if (!sdkLoaded || !pageReady) return
    if (paymentMethod !== 'CREDIT_CARD' || !showCardForm) return
    if (sdkReady) return
    initTapPay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkLoaded, bundleMode, cart.hydrated, loading, product, paymentMethod, showCardForm, sdkReady, tapPayConfig])

  // LINE Pay：只需 setupSDK（不需 card.setup），備妥後即可取得 LINE Pay prime
  useEffect(() => {
    if (!sdkLoaded || paymentMethod !== 'LINE_PAY') return
    ensureSetup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkLoaded, paymentMethod, tapPayConfig])

  // 優惠券試算（單張用商品原價、購物車用總額）
  useEffect(() => {
    const base = bundleMode ? cart.subtotal : product?.sellPrice
    if (base == null) return
    if (selectedCouponIds.length === 0) {
      setFinalPrice(base)
      setComboError(null)
      return
    }
    fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponIds: selectedCouponIds, productPrice: base }),
    }).then(r => r.json()).then(d => {
      if (d.valid) {
        setFinalPrice(d.finalPrice)
        setComboError(null)
      } else {
        setFinalPrice(base)
        setComboError(d.reason)
      }
    })
  }, [selectedCouponIds, product, bundleMode, cart.subtotal])

  const toggleCoupon = (id: string) => {
    setSelectedCouponIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // 付款結果處理（3DS 導轉 / 成功 / 失敗共用）
  // 只有在扣款被受理（導轉 3DS）或同步成功時才清空購物車；
  // 第一階段失敗時保留購物車，讓使用者可直接重試。
  const clearCartAfterCommit = () => {
    if (bundleMode) cart.clear()
    else if (productId) cart.remove(productId)
  }
  const handlePayResult = (res: { requiresRedirect?: boolean; paymentUrl?: string; ok?: boolean; error?: string }, successHref: string) => {
    console.log('[checkout] tappay response', { requiresRedirect: res.requiresRedirect, paymentUrl: res.paymentUrl ? `${res.paymentUrl.slice(0,40)}...` : null, ok: res.ok, error: res.error })
    if (res.requiresRedirect && res.paymentUrl) {
      clearCartAfterCommit()
      // LINE Pay / 3DS：用 TPDirect.redirect（LINE webview 不吞）；helper 內部會
      // 退回 window.location.href 作為 fallback。詳見 TapPay LINE Pay docs。
      redirectToPaymentUrl(res.paymentUrl)
    } else if (res.ok) {
      clearCartAfterCommit()
      router.replace(successHref)
    } else {
      setErrorMsg(res.error ?? '付款失敗，請重試')
      setSubmitting(false)
    }
  }

  // 把站內成功路徑轉成「能跳回 LINE/LIFF 內」的永久連結，交給 TapPay 當
  // frontend_redirect_url。若用一般 https URL，3DS / LINE Pay 完成後 LINE 會在
  // 外部瀏覽器開啟（使用者「被另開網頁」、且脫離 LINE 登入狀態）。轉成
  // liff.line.me 永久連結後，銀行頁完成會 deep-link 回 LINE 內的 LIFF。
  // liff 不可用（桌面測試）時 fallback 一般 URL。
  const buildReturnUrl = async (href: string): Promise<string> => {
    const full = `${window.location.origin}${href}`
    try {
      if (liff?.permanentLink?.createUrlBy) {
        return await liff.permanentLink.createUrlBy(full)
      }
    } catch { /* fallback below */ }
    return full
  }

  const handleSubmit = async () => {
    if (submitting) return
    // 信用卡 + 新卡：必須 SDK 就緒且卡片資訊有效
    if (paymentMethod === 'CREDIT_CARD' && useNewCard && (!canPay || !sdkReady)) return
    // LINE Pay：SDK 需已載入才能取得 prime
    if (paymentMethod === 'LINE_PAY' && !sdkLoaded) {
      setErrorMsg('付款模組載入中，請稍候再試')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    // 診斷：把每一步驟印到 console。卡在「付款中」時打開 Safari Remote
    // Inspector 就能直接看到流程停在哪。最後一個成功的 log 就是卡點。
    const dbg = (msg: string, data?: unknown) => {
      console.log(`[checkout] ${msg}`, data ?? '')
    }
    dbg('start', { paymentMethod, useNewCard, bundleMode, hasSavedCard: !!savedCard })

    // Watchdog：30 秒沒任何結果（無 redirect、無 success navigation、無錯誤）
    // 就強制解除 submitting 並提示使用者，避免 UI 永久卡死。
    let watchdogFired = false
    const watchdog = setTimeout(() => {
      watchdogFired = true
      console.error('[checkout] watchdog fired — no response within 30s')
      setErrorMsg('付款處理逾時（30 秒未回應）。請檢查網路後再試一次，或改用其他付款方式。')
      setSubmitting(false)
    }, 30_000)
    const stopWatchdog = () => {
      if (!watchdogFired) clearTimeout(watchdog)
    }

    let chargeBody: Record<string, unknown>
    let successHref: string

    if (bundleMode) {
      // ── 多張：建立 bundle 訂單 ──
      if (cart.items.length === 0) { stopWatchdog(); setErrorMsg('購物車是空的'); setSubmitting(false); return }
      let res: { ok?: boolean; bundleId?: string; error?: string } | null
      try {
        dbg('POST /api/orders/bundle ...')
        const r = await fetch('/api/orders/bundle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod,
            lines: cart.items.map(i => ({ productId: i.productId, qty: i.qty })),
            couponIds: selectedCouponIds,
          }),
        })
        dbg('bundle order HTTP', r.status)
        res = await r.json().catch(() => null)
        if (!r.ok || !res || !res.ok || !res.bundleId) {
          stopWatchdog()
          setErrorMsg(res?.error ?? `建立訂單失敗（${r.status}），請稍後再試`)
          setSubmitting(false)
          return
        }
      } catch (e) {
        stopWatchdog()
        console.error('[checkout] bundle order failed', e)
        setErrorMsg('網路錯誤，請重試')
        setSubmitting(false)
        return
      }
      successHref = `${base}/orders?bundleId=${res.bundleId}&paid=1`
      chargeBody = { bundleId: res.bundleId, returnUrl: await buildReturnUrl(successHref) }
    } else {
      // ── 單張：建立單筆訂單 ──
      if (!product || !productId || comboError) { stopWatchdog(); setSubmitting(false); return }
      let orderRes: { ok?: boolean; orderId?: string; error?: string }
      try {
        dbg('POST /api/orders ...', { productId })
        const r = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, couponIds: selectedCouponIds, paymentMethod }),
        })
        dbg('order HTTP', r.status)
        orderRes = await r.json()
      } catch (e) {
        stopWatchdog()
        console.error('[checkout] single order failed', e)
        setErrorMsg('網路錯誤，請重試')
        setSubmitting(false)
        return
      }
      if (!orderRes.ok || !orderRes.orderId) {
        stopWatchdog()
        setErrorMsg(orderRes.error ?? '建立訂單失敗')
        setSubmitting(false)
        return
      }
      // 單張也統一回到訂單列表頁（與多張一致），由列表頁跳回購券彈窗。
      // 帶 oid 供列表處理失敗/取消的 redirect（status≠0 → 自動取消該單，沿用原詳情頁邏輯）。
      successHref = `${base}/orders?paid=1&oid=${orderRes.orderId}`
      chargeBody = { orderId: orderRes.orderId, returnUrl: await buildReturnUrl(successHref) }
    }
    dbg('order created', { successHref })

    // ── LINE Pay：取得 LINE Pay prime → 後端建立交易 → 導轉至 LINE 授權頁 ──
    if (paymentMethod === 'LINE_PAY') {
      if (!ensureSetup()) {
        stopWatchdog()
        setErrorMsg('付款設定未就緒（後端尚未配置商家 TapPay 金鑰），請聯絡客服')
        setSubmitting(false)
        return
      }
      if (typeof window.TPDirect?.linePay?.getPrime !== 'function') {
        stopWatchdog()
        setErrorMsg('LINE Pay 模組尚未就緒，請稍候再試')
        setSubmitting(false)
        return
      }
      dbg('TPDirect.linePay.getPrime ...')
      window.TPDirect.linePay.getPrime(async result => {
        dbg('linePay.getPrime result', { prime: result?.prime ? `${result.prime.slice(0,8)}...` : null, status: result?.status, msg: result?.msg })
        if (!result?.prime) {
          stopWatchdog()
          setErrorMsg(result?.msg ?? '取得 LINE Pay 付款資訊失敗')
          setSubmitting(false)
          return
        }
        try {
          dbg('POST /api/payment/tappay (LINE_PAY) ...')
          const r = await fetch('/api/payment/tappay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...chargeBody, prime: result.prime, method: 'LINE_PAY' }),
          })
          dbg('tappay HTTP', r.status)
          const res = await r.json()
          stopWatchdog()
          // LINE Pay 一律導轉（handlePayResult 會處理 requiresRedirect）
          handlePayResult(res, successHref)
        } catch (e) {
          stopWatchdog()
          console.error('[checkout] LINE Pay tappay call failed', e)
          setErrorMsg('網路錯誤，請重試')
          setSubmitting(false)
        }
      })
      return
    }

    // ── 呼叫 TapPay 發動交易（單張 / 多張共用）──
    // 使用已儲存卡片（代扣）
    if (!useNewCard && savedCard) {
      try {
        dbg('POST /api/payment/tappay (saved card) ...')
        const r = await fetch('/api/payment/tappay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...chargeBody, useToken: true }),
        })
        dbg('tappay HTTP', r.status)
        const res = await r.json()
        stopWatchdog()
        handlePayResult(res, successHref)
      } catch (e) {
        stopWatchdog()
        console.error('[checkout] saved-card tappay call failed', e)
        setErrorMsg('網路錯誤，請重試')
        setSubmitting(false)
      }
      return
    }

    // 新卡：取得 prime 後送出
    dbg('TPDirect.card.getPrime ...')
    window.TPDirect.card.getPrime(async result => {
      dbg('card.getPrime result', { status: result.status, msg: result.msg, prime: result?.card?.prime ? `${result.card.prime.slice(0,8)}...` : null })
      if (result.status !== 0) {
        stopWatchdog()
        setErrorMsg(result.msg ?? '取得卡片資訊失敗')
        setSubmitting(false)
        return
      }
      try {
        dbg('POST /api/payment/tappay (new card) ...')
        const r = await fetch('/api/payment/tappay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...chargeBody, prime: result.card.prime, remember }),
        })
        dbg('tappay HTTP', r.status)
        const res = await r.json()
        stopWatchdog()
        handlePayResult(res, successHref)
      } catch (e) {
        stopWatchdog()
        console.error('[checkout] new-card tappay call failed', e)
        setErrorMsg('網路錯誤，請重試')
        setSubmitting(false)
      }
    })
  }

  // 信用卡輸入框 — 容器只負責外觀，內容（input）完全交給 TapPay iframe。
  // 關鍵：用 height 固定總高、box-sizing: border-box 把 border 算進去，避免
  //       iframe 跟外框錯位、placeholder 漂到下方（原本 minHeight + padding
  //       會讓 iframe 高度 ≠ 容器可視高度）。padding 留給 iframe 自己處理
  //       （透過 setup() 裡 styles.input.line-height 控制垂直置中）。
  // 注意：不可用 backdrop-filter，否則 LINE 內嵌瀏覽器無法點擊 TapPay iframe。
  const fieldStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '0 14px',
    height: 50,
    background: '#ffffff',
    boxSizing: 'border-box',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }
  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: 12.5, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.02em',
  }

  const pageReady = bundleMode ? cart.hydrated : (!loading && !!product)
  if (!pageReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ width: 28, height: 28, border: `2.5px solid ${C.light}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  // 多張模式但購物車空了
  // 付款進行中會先清空購物車再導轉，這段時間不可閃出「購物車是空的」(submitting 時略過，
  // 改由下方全螢幕「處理中」遮罩接手)。
  if (bundleMode && cart.items.length === 0 && !submitting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 14, padding: 24 }}>
        <p style={{ color: '#94a3b8', fontSize: 15 }}>購物車是空的</p>
        <button
          onClick={() => router.back()}
          style={{ background: C.primary, color: C.onPrimary, border: 'none', borderRadius: 100, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          返回
        </button>
      </div>
    )
  }

  const bundleItems = cart.items
  const bundleQty = cart.totalQty
  const bundleSubtotal = cart.subtotal
  const basePrice = bundleMode ? bundleSubtotal : product!.sellPrice
  const displayPrice = finalPrice ?? basePrice
  const discount = basePrice - displayPrice
  // 多張：把總折扣攤回每一張，讓上方每張卡也顯示折後價（順序對齊 bundleItems）
  const lineDiscounts = allocateLineDiscounts(bundleItems.map(i => i.sellPrice * i.qty), discount)

  const cc = paymentMethod === 'CREDIT_CARD'
  const lp = paymentMethod === 'LINE_PAY'

  // 按鈕可否點擊：
  //   信用卡新卡 → SDK 就緒且卡片有效；已儲存卡片 → 可直接送出；LINE Pay → SDK 已載入即可
  const methodReady = cc
    ? ((!useNewCard && savedCard) ? true : (canPay && sdkReady))
    : (lp ? sdkLoaded : false)
  const canSubmit = !submitting && !comboError && methodReady

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 8px' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: C.primaryText, fontSize: 14 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>確認訂單</h1>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {bundleMode ? (
          /* ── 多張：購物車明細 + 上方張數 ── */
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.07)',
            padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>
                共 {bundleQty} 張 eSIM
              </p>
              <span style={{
                fontSize: 12, fontWeight: 700, color: C.primaryText,
                background: C.light, borderRadius: 100, padding: '3px 12px',
              }}>
                {bundleItems.length} 項
              </span>
            </div>

            {bundleItems.map((item, idx) => (
              <div key={item.productId} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: C.light,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CountryFlag code={item.countryCode} fallbackEmoji={item.countryFlag} size={30} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: '0 0 2px' }}>{item.countryNameZh}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11.5, color: '#64748b' }}>
                      {item.displayDays} 天{item.dataCapacity ? ` · ${item.dataCapacity}` : ''}
                    </span>
                    <NetworkBadge networkType={item.networkType} />
                    <NativeSimBadge isNative={item.isNativeSim} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {lineDiscounts[idx] > 0 ? (
                    <>
                      <p style={{ fontSize: 10.5, color: '#94a3b8', margin: 0, textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                        NT${(item.sellPrice * item.qty).toLocaleString()}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: C.primaryText, margin: '1px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                        NT${(item.sellPrice * item.qty - lineDiscounts[idx]).toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 14, fontWeight: 800, color: C.primaryText, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                      NT${(item.sellPrice * item.qty).toLocaleString()}
                    </p>
                  )}
                  {item.qty > 1 && (
                    <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '1px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                      NT${item.sellPrice.toLocaleString()} × {item.qty}
                    </p>
                  )}
                </div>
              </div>
            ))}

            <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
              一次刷卡完成 · 每張 eSIM 會獨立發送 · 優惠券折抵整筆總額
            </p>
          </div>
        ) : (
          /* ── 單張：商品卡 ── */
          <div style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid rgba(0,0,0,0.07)',
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, flexShrink: 0,
              background: C.light,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CountryFlag code={product!.countryCode} fallbackEmoji={product!.countryFlag} size={40} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>{product!.countryNameZh}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, color: '#4b5563',
                  background: '#f3f4f6', borderRadius: 6, padding: '2px 8px',
                }}>
                  {product!.displayDays} 天
                </span>
                {product!.dataCapacity && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: '#4b5563',
                    background: '#f3f4f6', borderRadius: 6, padding: '2px 8px',
                  }}>
                    {product!.dataCapacity}
                  </span>
                )}
                <NetworkBadge networkType={product!.networkType} />
                <NativeSimBadge isNative={product!.isNativeSim} />
              </div>
              {discount > 0 ? (
                <p style={{ fontSize: 20, fontWeight: 800, color: C.primaryText, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', textDecoration: 'line-through' }}>NT${product!.sellPrice.toLocaleString()}</span>
                  <span>NT${displayPrice.toLocaleString()}</span>
                </p>
              ) : (
                <p style={{ fontSize: 20, fontWeight: 800, color: C.primaryText, margin: 0, letterSpacing: '-0.02em' }}>
                  NT${product!.sellPrice.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Coupon section（單張與購物車皆適用；購物車折整筆總額） */}
        {(
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px 4px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>使用優惠券</p>
              {autoSelectedIds.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  background: '#d1fae5', color: '#065f46',
                  padding: '2px 8px', borderRadius: 100,
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  ✦ 已自動帶入最優惠組合
                </span>
              )}
            </div>
            {coupons.length === 0 ? (
              <div style={{
                background: '#fff', borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.07)',
                padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <TicketIcon color="#94a3b8" />
                <span style={{ flex: 1, fontSize: 14, color: '#94a3b8' }}>選取或輸入優惠碼</span>
                <span style={{ fontSize: 13, color: '#c4c9d4' }}>尚無可用 ›</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {coupons.map(c => {
                  const selected = selectedCouponIds.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center',
                        background: selected ? C.light : '#fff',
                        borderRadius: 12,
                        border: `1.5px solid ${selected ? C.primary : 'rgba(0,0,0,0.07)'}`,
                        padding: '13px 16px', cursor: 'pointer',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    >
                      <div style={{ marginRight: 12, flexShrink: 0 }}>
                        <TicketIcon color={selected ? C.primary : '#94a3b8'} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{TYPE_LABEL[c.type] ?? c.type}</p>
                        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{c.level} 級券</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: C.primaryText }}>
                          {Math.round((1 - c.discount) * 100)}% OFF
                        </span>
                        <div
                          style={{
                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                            border: `2px solid ${selected ? C.primary : '#d1d5db'}`,
                            background: selected ? C.primary : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                          onClick={() => toggleCoupon(c.id)}
                        >
                          {selected && (
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={C.onPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="2 6 5 9 10 3" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
                {comboError && (
                  <p style={{ fontSize: 12, color: '#ef4444', margin: '0 0 0 4px' }}>{comboError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment method */}
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px 4px' }}>付款方式</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* 信用卡：可展開的同一框格，刷卡欄位就在框內 */}
            {methods.creditCard && (
            <div style={{
              borderRadius: 14,
              border: `1.5px solid ${cc ? C.primary : 'rgba(0,0,0,0.07)'}`,
              background: '#fff',
              overflow: 'hidden',
              transition: 'border-color 0.15s',
            }}>
              <label
                onClick={() => setPaymentMethod('CREDIT_CARD')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', cursor: 'pointer',
                  background: cc ? C.light : '#fff',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${cc ? C.primary : '#d1d5db'}`,
                  background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {cc && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />}
                </div>
                <div style={{ color: cc ? C.primary : '#4b5563', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <CreditCardIcon />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>信用卡</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Visa / Mastercard / JCB</p>
                </div>
              </label>

              {/* 展開：刷卡欄位（與信用卡同框） */}
              {cc && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', padding: '14px 16px', background: '#fff' }}>
                  {savedCard === undefined ? (
                    <div style={{ padding: '8px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>載入付款模組中…</div>
                  ) : (
                    <>
                      {/* 已儲存卡片 */}
                      {savedCard && !useNewCard && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '12px 14px', borderRadius: 12,
                          background: '#f6f7f9', border: '1px solid rgba(0,0,0,0.06)',
                        }}>
                          <CardTypeBadge type={savedCard.cardType} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
                              {savedCard.cardTypeLabel} **** {savedCard.lastFour}
                            </p>
                            {savedCard.expiresAt && (
                              <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>有效期限 {savedCard.expiresAt}</p>
                            )}
                          </div>
                          <button
                            onClick={() => setUseNewCard(true)}
                            style={{
                              background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
                              borderRadius: 8, padding: '6px 12px',
                              fontSize: 12, fontWeight: 600, color: '#4b5563', cursor: 'pointer',
                            }}
                          >
                            更換
                          </button>
                        </div>
                      )}

                      {/* 新卡輸入 */}
                      {showCardForm && (
                        <>
                          {savedCard && useNewCard && (
                            <button
                              onClick={() => setUseNewCard(false)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                background: 'none', border: 'none', padding: '0 0 12px',
                                fontSize: 13, color: C.primaryText, cursor: 'pointer', fontWeight: 600,
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                              </svg>
                              使用已儲存的卡片
                            </button>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <label style={fieldLabel}>卡號</label>
                              <div id="card-number" style={fieldStyle} />
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <div style={{ flex: 1 }}>
                                <label style={fieldLabel}>有效期限</label>
                                <div id="card-expiry" style={fieldStyle} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={fieldLabel}>安全碼</label>
                                <div id="card-ccv" style={fieldStyle} />
                              </div>
                            </div>

                            {/* 記住此卡片：與卡號同框、壓成一行 */}
                            <label
                              onClick={() => setRemember(r => !r)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 2 }}
                            >
                              <div style={{
                                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                border: `2px solid ${remember ? C.primary : 'rgba(0,0,0,0.2)'}`,
                                background: remember ? C.primary : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s',
                              }}>
                                {remember && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.onPrimary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>記住此卡片</span>
                              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>下次快速付款</span>
                            </label>
                          </div>

                          {/* TapPay 安全性聲明 */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden>
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <p style={{ fontSize: 11, lineHeight: 1.6, color: '#9ca3af', margin: 0 }}>
                              本公司採用喬睿科技 TapPay 金流交易系統，消費者刷卡時直接在銀行端系統中交易，本公司不會留下您的信用卡資料，資料傳輸採用 SSL 2048bit 加密技術保護。
                            </p>
                          </div>

                          {!sdkReady && (
                            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 10 }}>載入付款模組中…</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            )}

            {/* LINE Pay */}
            {methods.linePay && (
            <div>
              <label
                onClick={() => setPaymentMethod('LINE_PAY')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: lp ? C.light : '#fff',
                  borderRadius: 14,
                  border: `1.5px solid ${lp ? C.primary : 'rgba(0,0,0,0.07)'}`,
                  padding: '14px 16px', cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${lp ? C.primary : '#d1d5db'}`,
                  background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {lp && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.primary }} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <LinePayIcon />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>LINE Pay</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>使用 LINE Pay 付款</p>
                </div>
              </label>
              {lp && (
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '8px 0 0 4px' }}>
                  點「確認付款」後將導向 LINE Pay 完成授權
                </p>
              )}
            </div>
            )}

            {!methods.creditCard && !methods.linePay && (
              <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                目前未開放線上付款，請聯絡客服。
              </p>
            )}
          </div>
        </div>

        {/* Price summary */}
        <div style={{
          background: '#fff', borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.07)',
          padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
            <span>{bundleMode ? `商品小計（${bundleQty} 張）` : '商品原價'}</span>
            <span>NT${(bundleMode ? bundleSubtotal : product!.sellPrice).toLocaleString()}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#16a34a' }}>
              <span>優惠折扣</span>
              <span>-NT${discount.toLocaleString()}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 15, fontWeight: 700,
            borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10, marginTop: 2,
          }}>
            <span style={{ color: '#1a1a1a' }}>實付金額</span>
            <span style={{ color: C.primaryText, fontSize: 18, letterSpacing: '-0.02em' }}>NT${displayPrice.toLocaleString()}</span>
          </div>
        </div>

      </div>

      {/* 處理中遮罩：按下確認付款後，建單→產生回跳連結→取卡→送出需數秒，
          全螢幕遮罩給明確回饋（避免看起來像沒反應），也蓋掉清空購物車的瞬間。 */}
      {submitting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1050,
          background: 'rgba(255,255,255,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        }}>
          <div style={{ width: 34, height: 34, border: `3px solid ${C.light}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>處理付款中…</p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>請稍候，正在前往付款頁，勿關閉或返回</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* 付款失敗彈窗：信用卡第一段（pay-by-prime / pay-by-token）失敗時，
          以中文原因跳窗提醒，避免被底部固定列遮住而漏看。 */}
      {errorMsg && (
        <div
          onClick={() => setErrorMsg(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: '24px 20px',
              maxWidth: 360, width: '100%',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 12 }}>⚠️</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' }}>付款失敗</p>
            <p style={{ fontSize: 14, color: '#dc2626', margin: '0 0 20px', lineHeight: 1.5 }}>{errorMsg}</p>
            <button
              onClick={() => setErrorMsg(null)}
              style={{
                width: '100%', padding: '12px 0', border: 'none', borderRadius: 12,
                background: C.primary, color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* Sticky bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        padding: '14px 20px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
      }}>
        {profileComplete === false && (
          <div style={{ maxWidth: 520, margin: '0 auto 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', margin: 0 }}>⚠️ 請先完成基本資料才能付款</p>
            <p style={{ fontSize: 12, color: '#c2410c', margin: '2px 0 0', lineHeight: 1.5 }}>付款與 eSIM 開卡需要你的姓名／電話／Email，點下方按鈕前往填寫。</p>
          </div>
        )}
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            {discount > 0 && (
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, textDecoration: 'line-through' }}>NT${basePrice.toLocaleString()}</p>
            )}
            <p style={{ fontSize: 24, fontWeight: 800, color: C.primaryText, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              NT${displayPrice.toLocaleString()}
            </p>
            {discount > 0 && (
              <p style={{ fontSize: 11, color: '#16a34a', margin: '2px 0 0', fontWeight: 600 }}>省 NT${discount.toLocaleString()}</p>
            )}
          </div>
          {profileComplete === false ? (
            <button
              onClick={() => router.push(`${base}/profile/setup?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
              style={{
                flex: 1,
                background: C.primary,
                color: C.onPrimary,
                border: 'none', borderRadius: 100,
                padding: '15px 24px',
                fontSize: 16, fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              前往填寫基本資料 →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                flex: 1,
                background: !canSubmit ? '#94a3b8' : C.primary,
                color: C.onPrimary,
                border: 'none', borderRadius: 100,
                padding: '15px 24px',
                fontSize: 16, fontWeight: 800,
                cursor: !canSubmit ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {submitting ? '付款中…' : '確認付款 →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
