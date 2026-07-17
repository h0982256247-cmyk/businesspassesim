'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors, useTenant } from '@/components/liff/TenantContext'
import { type CouponItem } from '@/lib/utils/coupon-combo'
import { pickInitialDay, PRODUCTS_DEFAULT_DAYS } from '@/lib/utils/products-day-default'
import { peekCache, setCache, productsCacheKey } from '@/hooks/useCachedData'

type ProductsApiResponse = { countries?: Country[]; products?: Product[] }
import { GlobeIllustration } from '@/components/liff/LiffIllustrations'
import { PRODUCTS_TEMPLATES } from '@/components/liff/templates/registry'
import SetupModal from '@/components/liff/SetupModal'
import { useCart } from '@/components/liff/CartProvider'
import type { Country, Product, DayFilterControls, CartControls } from '@/components/liff/templates/products/types'

const COMMON_PRESETS = [1, 3, 5, 7, 14, 30]

// 商城頁的流量類型篩選按鈕（與主頁搜尋一致）；置中、可切換、null=全部。
const DATA_TYPE_OPTIONS = ['總量', '每日型', '吃到飽']

// 把 dataCapacity 歸類成主頁搜尋的三種流量類型：吃到飽 / 每日型 / 總量。
// 對應主頁 DATA_OPTIONS（'總量' / '每日型' / '吃到飽'）的 ?data 參數做篩選。
function capKindOf(dc: string | null): '總量' | '每日型' | '吃到飽' | '' {
  if (!dc) return ''
  if (/吃到飽|無限|不限|max|hsd|鈦金|高速/i.test(dc)) return '吃到飽'
  if (/\/\s*(天|日|day)/i.test(dc)) return '每日型'
  return '總量'
}

function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 16 }}>
      <GlobeIllustration size={80} />
      <p style={{ fontSize: 13, color: '#94a3b8', letterSpacing: '0.04em' }}>載入中</p>
    </div>
  )
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductsContent />
    </Suspense>
  )
}

function ProductsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ slug?: string }>()
  const slug = params?.slug ?? ''
  const selectedCountry = searchParams.get('country')
  const showSetup = searchParams.get('setup') === '1'
  // 主頁搜尋帶入：天數 + 流量類型（總量 / 每日型 / 吃到飽）
  const searchDays = searchParams.get('days')
  // 流量類型用 state：初始吃主頁搜尋帶的 ?data，使用者可在商城頁用按鈕切換（null=全部）
  const [dataType, setDataType] = useState<string | null>(searchParams.get('data'))
  const { isReady } = useLiff()
  const C = useTenantColors()
  const tenant = useTenant()
  const cart = useCart()

  const [countries, setCountries] = useState<Country[]>([])
  // allProducts = 後端抓回的「所有方案」；selectedCountry/dayFilter 在前端篩選，避免切國家時重打 API
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [coupons, setCoupons] = useState<CouponItem[]>([])
  const [loading, setLoading] = useState(true)

  // Day filter state — 有從搜尋帶 ?days 就用它，否則預設 5（避免「340 → 17」閃爍）
  const initialDay = (() => {
    const n = searchDays ? parseInt(searchDays) : NaN
    return Number.isFinite(n) && n > 0 ? n : PRODUCTS_DEFAULT_DAYS
  })()
  const [dayFilter, setDayFilter] = useState<number>(initialDay)
  const [pickerDays, setPickerDays] = useState<number>(initialDay)

  // 切國家時重設回 5（不重置成 0，避免又出現一次閃爍）。
  // 首次掛載略過：保留從主頁搜尋帶進來的 ?days，不被重設覆蓋。
  const dayResetSkipRef = useRef(true)
  useEffect(() => {
    if (dayResetSkipRef.current) { dayResetSkipRef.current = false; return }
    setDayFilter(PRODUCTS_DEFAULT_DAYS)
    setPickerDays(PRODUCTS_DEFAULT_DAYS)
  }, [selectedCountry])

  function dismissSetup() {
    const next = new URLSearchParams(searchParams.toString())
    next.delete('setup')
    const qs = next.toString()
    router.replace(qs ? `?${qs}` : `/liff/${slug}/products`)
  }

  // 初次 ready 時抓資料，後續切國家純前端 filter；
  // 跨頁共用 cache 已有 hit（主頁預熱寫入）就先 setState 立即顯示，背景刷新拿最新
  useEffect(() => {
    if (!isReady) return
    let cancelled = false

    const cached = peekCache<ProductsApiResponse>(productsCacheKey())
    if (cached) {
      setCountries(cached.countries ?? [])
      setAllProducts(cached.products ?? [])
      setLoading(false)
    }

    async function load() {
      const [prodData, couponData] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/coupons').then(r => r.json()).catch(() => ({ coupons: [] })),
      ])
      if (cancelled) return
      // 拿到最新 → 同時更新狀態與快取（用 setCache 強制覆蓋，prefetchCache 會跳過已存在的 key）
      setCache(productsCacheKey(), prodData)
      setCountries(prodData.countries ?? [])
      setAllProducts(prodData.products ?? [])
      const now = new Date()
      setCoupons(
        (couponData.coupons ?? [])
          .filter((c: CouponItem & { usedAt?: string | null; expiresAt?: string | null }) =>
            !c.usedAt && (!c.expiresAt || new Date(c.expiresAt) > now)
          )
          .map((c: CouponItem) => ({ id: c.id, discount: c.discount }))
      )
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [isReady])

  // 依 selectedCountry 在前端 filter — 切國家瞬間完成、不需 API roundtrip
  const products = useMemo(
    () => selectedCountry ? allProducts.filter(p => p.countryCode === selectedCountry) : allProducts,
    [allProducts, selectedCountry],
  )

  // 適用國家取「整組（未經天數篩選）」的第一個有值者，避免被日篩濾掉而抓不到
  const coverageCountries = useMemo(
    () => products.find(p => p.coverageCountries)?.coverageCountries ?? null,
    [products],
  )

  const availableDays = useMemo(() => {
    const set = new Set<number>()
    products.forEach(p => set.add(p.displayDays))
    return Array.from(set).sort((a, b) => a - b)
  }, [products])

  // Fallback：該國家沒有 5 天方案時，改抓最接近 5 的可用天數
  useEffect(() => {
    if (availableDays.length === 0) return
    if (availableDays.includes(pickerDays)) return
    const chosen = pickInitialDay(availableDays)
    if (chosen !== null) {
      setPickerDays(chosen)
      setDayFilter(chosen)
    }
  }, [availableDays, pickerDays])

  const filteredProducts = useMemo(() => {
    let list = dayFilter ? products.filter(p => p.displayDays === dayFilter) : products
    if (dataType) list = list.filter(p => capKindOf(p.dataCapacity) === dataType)
    return list
  }, [products, dayFilter, dataType])

  const nearestDays = useMemo(() => {
    if (!dayFilter || filteredProducts.length > 0) return []
    return [...availableDays]
      .sort((a, b) => Math.abs(a - dayFilter) - Math.abs(b - dayFilter))
      .slice(0, 3)
  }, [dayFilter, filteredProducts.length, availableDays])

  const presets = useMemo(() => {
    const fromData = COMMON_PRESETS.filter(n => availableDays.includes(n))
    return fromData.length >= 3 ? fromData : availableDays.slice(0, 6)
  }, [availableDays])

  const filter: DayFilterControls = useMemo(() => ({
    pickerDays: pickerDays || (availableDays[0] ?? 1),
    dayFilter,
    availableDays,
    presets,
    minDay: availableDays[0] ?? 1,
    maxDay: availableDays[availableDays.length - 1] ?? 30,
    onChange: (n: number) => { setPickerDays(n); setDayFilter(n) },
    onClear: () => setDayFilter(0),
    filteredCount: filteredProducts.length,
    totalCount: products.length,
    nearestDays,
    dataType,
    dataOptions: DATA_TYPE_OPTIONS,
    onDataType: (t: string | null) => setDataType(t),
  }), [pickerDays, dayFilter, availableDays, presets, filteredProducts.length, products.length, nearestDays, dataType])

  const cartControls: CartControls = useMemo(() => ({
    has: (id: string) => cart.has(id),
    toggle: (product: Product) => {
      if (cart.has(product.id)) {
        cart.remove(product.id)
        return
      }
      const country = countries.find(c => c.countryCode === product.countryCode)
      cart.add({
        productId: product.id,
        countryCode: product.countryCode,
        countryNameZh: product.countryNameZh,
        countryFlag: country?.countryFlag ?? null,
        displayDays: product.displayDays,
        dataCapacity: product.dataCapacity,
        networkType: product.networkType,
        isNativeSim: product.isNativeSim,
        sellPrice: product.sellPrice,
      })
    },
  }), [cart, countries])

  if (loading) return <Spinner />

  const templateKey = tenant?.productsTemplate ?? 'classic'
  const Template = PRODUCTS_TEMPLATES[templateKey]

  return (
    <>
      {showSetup && <SetupModal slug={slug} onDismiss={dismissSetup} colors={C} logoUrl={tenant?.logoUrl ?? null} />}
      <Template
        slug={slug}
        countries={countries}
        products={filteredProducts}
        coverageCountries={coverageCountries}
        coupons={coupons}
        selectedCountry={selectedCountry}
        showSetup={showSetup}
        colors={C}
        logoUrl={tenant?.logoUrl ?? null}
        onSelectCountry={code => router.push(`/liff/${slug}/products?country=${encodeURIComponent(code)}`)}
        onSelectProduct={id => router.push(`/liff/${slug}/products/${id}`)}
        onBack={() => router.push(`/liff/${slug}/products`)}
        onDismissSetup={dismissSetup}
        filter={filter}
        cart={cartControls}
      />
    </>
  )
}
