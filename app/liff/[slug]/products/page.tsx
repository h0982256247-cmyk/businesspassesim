'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { useLiff } from '@/components/liff/LiffProvider'
import { useTenantColors, useTenant } from '@/components/liff/TenantContext'
import { peekCache, setCache, productsCacheKey } from '@/hooks/useCachedData'

type ProductsApiResponse = { countries?: Country[]; products?: Product[] }
import { S } from '@/lib/liff/tokens'
import ClassicShop from '@/components/liff/templates/products/ClassicShop'
import SetupModal from '@/components/liff/SetupModal'
import { useCart } from '@/components/liff/CartProvider'
import type { Country, Product, DayFilterControls, CartControls } from '@/components/liff/templates/products/types'

// 商城頁的方案類型（與主頁搜尋一致）：總量 / 每日型 / 吃到飽。
const DATA_TYPE_OPTIONS = ['總量', '每日型', '吃到飽']

// 把 dataCapacity 歸類成主頁搜尋的三種流量類型：吃到飽 / 每日型 / 總量。
// 對應主頁 DATA_OPTIONS（'總量' / '每日型' / '吃到飽'）的 ?data 參數做篩選。
function capKindOf(dc: string | null): '總量' | '每日型' | '吃到飽' | '' {
  if (!dc) return ''
  if (/吃到飽|無限|不限|max|hsd|鈦金|高速/i.test(dc)) return '吃到飽'
  if (/\/\s*(天|日|day)/i.test(dc)) return '每日型'
  return '總量'
}

// 商品列表載入骨架：鏡射 ClassicShop 版型（hero + 2 欄目的地卡格），
// 取代白屏轉圈，讓使用者立刻看到頁面結構、感知更快。
function ProductsSkeleton() {
  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 96, background: S.bg, minHeight: '100vh' }}>
      <div style={{ padding: '20px 16px 0' }}>
        <div className="liff-shimmer" style={{ borderRadius: 24, height: 148 }} />
      </div>
      <div style={{ padding: '24px 20px 12px' }}>
        <div className="liff-shimmer" style={{ width: 120, height: 18, borderRadius: 6 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="liff-shimmer" style={{ borderRadius: 20, minHeight: 168 }} />
        ))}
      </div>
    </div>
  )
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
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
  const [loading, setLoading] = useState(true)

  // 天數篩選：0 = 全部天數。初始吃主頁搜尋帶的 ?days（無/無效則全部）。
  const [dayFilter, setDayFilter] = useState<number>(() => {
    const n = searchDays ? parseInt(searchDays) : NaN
    return Number.isFinite(n) && n > 0 ? n : 0
  })

  // 切國家時把天數/方案重設為「全部」；首次掛載略過以保留主頁搜尋帶入的 ?days/?data。
  const filterResetSkipRef = useRef(true)
  useEffect(() => {
    if (filterResetSkipRef.current) { filterResetSkipRef.current = false; return }
    setDayFilter(0)
    setDataType(null)
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
      const prodData = await fetch('/api/products').then(r => r.json())
      if (cancelled) return
      // 拿到最新 → 同時更新狀態與快取（用 setCache 強制覆蓋，prefetchCache 會跳過已存在的 key）
      setCache(productsCacheKey(), prodData)
      setCountries(prodData.countries ?? [])
      setAllProducts(prodData.products ?? [])
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

  // 交叉過濾：天數選項依已選方案類型；方案選項依已選天數。
  const availableDays = useMemo(() => {
    const set = new Set<number>()
    for (const p of products) if (!dataType || capKindOf(p.dataCapacity) === dataType) set.add(p.displayDays)
    return Array.from(set).sort((a, b) => a - b)
  }, [products, dataType])

  const availableDataTypes = useMemo(
    () => DATA_TYPE_OPTIONS.filter(t => products.some(p => capKindOf(p.dataCapacity) === t && (!dayFilter || p.displayDays === dayFilter))),
    [products, dayFilter],
  )

  // eff：狀態若不在可選範圍（例如搜尋帶入此國沒有的天數）→ 視為全部，避免顯示 0 筆。
  const effDay = dayFilter && availableDays.includes(dayFilter) ? dayFilter : 0
  const effType = dataType && availableDataTypes.includes(dataType) ? dataType : null

  const filteredProducts = useMemo(
    () => products.filter(p => (!effDay || p.displayDays === effDay) && (!effType || capKindOf(p.dataCapacity) === effType)),
    [products, effDay, effType],
  )

  const filter: DayFilterControls = useMemo(() => ({
    dayFilter: effDay,
    availableDays,
    onDay: (n: number) => setDayFilter(n),
    dataType: effType,
    availableDataTypes,
    onDataType: (t: string | null) => setDataType(t),
    onClear: () => { setDayFilter(0); setDataType(null) },
    filteredCount: filteredProducts.length,
    totalCount: products.length,
  }), [effDay, availableDays, effType, availableDataTypes, filteredProducts.length, products.length])

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
        benefitPrice: product.benefitPrice,
      })
    },
  }), [cart, countries])

  if (loading) return <ProductsSkeleton />

  return (
    <>
      {showSetup && <SetupModal slug={slug} onDismiss={dismissSetup} colors={C} logoUrl={tenant?.logoUrl ?? null} />}
      <ClassicShop
        slug={slug}
        countries={countries}
        products={filteredProducts}
        allProducts={allProducts}
        coverageCountries={coverageCountries}
        selectedCountry={selectedCountry}
        showSetup={showSetup}
        colors={C}
        logoUrl={tenant?.logoUrl ?? null}
        shopHeroUrl={tenant?.shopHeroUrl ?? null}
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
