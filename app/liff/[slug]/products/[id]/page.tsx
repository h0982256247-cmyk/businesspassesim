'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { SignalIllustration } from '@/components/liff/LiffIllustrations'
import { useTenantColors } from '@/components/liff/TenantContext'
import { calcBestPrice, type CouponItem } from '@/lib/utils/coupon-combo'
import { CountryFlag } from '@/components/common/CountryFlag'
import { useCart } from '@/components/liff/CartProvider'
import { NetworkBadge, NativeSimBadge, parseNetworkType } from '@/components/liff/ProductBadges'

type Product = {
  id: string
  countryCode: string
  countryNameZh: string
  countryNameEn: string
  countryFlag: string | null
  displayDays: number
  dataCapacity: string | null
  networkType: string | null
  isNativeSim: boolean
  description: string | null
  sellPrice: number
}

const S = {
  bg: '#f9f9f9',
  white: '#ffffff',
  ink: '#1a1a1a',
  muted: '#4b5563',
  faint: '#94a3b8',
  line: 'rgba(0,0,0,0.07)',
} as const

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function ProductDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const base = useLiffBase()
  const C = useTenantColors()
  const cart = useCart()
  const [product, setProduct] = useState<Product | null>(null)
  const [coupons, setCoupons] = useState<CouponItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/products/${id}`).then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      }),
      fetch('/api/coupons').then(r => r.json()).catch(() => ({ coupons: [] })),
    ]).then(([prodData, couponData]) => {
      if (prodData) setProduct(prodData.product)
      const now = new Date()
      setCoupons(
        (couponData.coupons ?? [])
          .filter((c: CouponItem & { usedAt?: string | null; expiresAt?: string | null }) =>
            !c.usedAt && (!c.expiresAt || new Date(c.expiresAt) > now)
          )
          .map((c: CouponItem) => ({ id: c.id, discount: c.discount }))
      )
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ width: 28, height: 28, border: `2.5px solid ${C.light}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (notFound || !product) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16 }}>
      <p style={{ color: S.faint, fontSize: 14 }}>商品不存在或已下架</p>
      <button onClick={() => router.back()} style={{ color: C.primaryText, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}>返回上一頁</button>
    </div>
  )

  const descLines = product.description?.split('\n').filter(Boolean) ?? []
  const net = parseNetworkType(product.networkType)

  const features: string[] = [
    product.dataCapacity ? product.dataCapacity : null,
    net.label ? `支援 ${net.label} 高速網路` : null,
    product.isNativeSim ? '原生 SIM · 非漫遊，穩定連線' : null,
    'eSIM 即插即用，無需實體 SIM',
    '購買後即可收到安裝教學',
  ].filter(Boolean) as string[]

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 'calc(160px + env(safe-area-inset-bottom))' }}>
      {/* Nav bar */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, display: 'flex', alignItems: 'center', padding: 4 }}
        >
          <BackArrow />
        </button>
        <span style={{ fontSize: 14, color: S.muted }}>{product.countryNameZh}</span>
      </div>

      {/* Hero card */}
      <div style={{ margin: '0 16px', background: S.white, borderRadius: 20, border: `1px solid ${S.line}`, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        {/* Top band */}
        <div style={{
          background: `linear-gradient(135deg, ${C.light} 0%, ${C.soft} 100%)`,
          padding: '28px 24px 22px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CountryFlag code={product.countryCode} fallbackEmoji={product.countryFlag} size={36} />
              <div>
                <p style={{ fontSize: 17, fontWeight: 700, color: S.ink, margin: 0 }}>{product.countryNameZh}</p>
                <p style={{ fontSize: 12, color: S.faint, margin: 0 }}>{product.countryNameEn}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: S.ink, letterSpacing: '-0.04em', lineHeight: 1 }}>{product.displayDays}</span>
              <span style={{ fontSize: 16, color: S.muted, fontWeight: 500 }}>天方案</span>
            </div>
            {(net.label || product.isNativeSim) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                <NetworkBadge networkType={product.networkType} size="md" />
                <NativeSimBadge isNative={product.isNativeSim} size="md" />
              </div>
            )}
          </div>
          <SignalIllustration size={54} />
        </div>

        {/* Specs */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: C.light,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckIcon color={C.primary} />
                </div>
                <span style={{ fontSize: 14, color: S.muted }}>{f}</span>
              </div>
            ))}
          </div>

          {descLines.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${S.line}` }}>
              {descLines.map((line, i) => (
                <p key={i} style={{ fontSize: 13, color: S.faint, margin: i > 0 ? '4px 0 0' : 0 }}>{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky CTA — sits above the bottom nav (zIndex 50) */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(64px + env(safe-area-inset-bottom))',
        left: 0, right: 0,
        zIndex: 49,
        background: 'rgba(249,249,249,0.97)',
        backdropFilter: 'blur(10px)',
        borderTop: `1px solid ${S.line}`,
        padding: '12px 16px',
      }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {(() => {
              const { bestPrice, savedAmount, hasDiscount } = calcBestPrice(coupons, product.sellPrice)
              return hasDiscount ? (
                <>
                  <p style={{ fontSize: 11, color: S.faint, margin: 0, textDecoration: 'line-through' }}>
                    NT${product.sellPrice.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: C.primaryText, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    NT${bestPrice.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 11, color: '#16a34a', marginTop: 1, fontWeight: 600 }}>
                    省 NT${savedAmount.toLocaleString()}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11, color: S.faint, margin: 0 }}>售價</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: C.primaryText, margin: 0, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    NT${product.sellPrice.toLocaleString()}
                  </p>
                </>
              )
            })()}
          </div>

          {/* Add to cart (icon button) */}
          {(() => {
            const inCart = cart.has(product.id)
            return (
              <button
                onClick={() => {
                  if (inCart) {
                    cart.remove(product.id)
                  } else {
                    cart.add({
                      productId: product.id,
                      countryCode: product.countryCode,
                      countryNameZh: product.countryNameZh,
                      countryFlag: product.countryFlag,
                      displayDays: product.displayDays,
                      dataCapacity: product.dataCapacity,
                      networkType: product.networkType,
                      isNativeSim: product.isNativeSim,
                      sellPrice: product.sellPrice,
                    })
                    setJustAdded(true)
                    setTimeout(() => setJustAdded(false), 1200)
                  }
                }}
                aria-label={inCart ? '從購物車移除' : '加入購物車'}
                style={{
                  width: 54, height: 54, flexShrink: 0,
                  borderRadius: '50%',
                  border: `1.5px solid ${inCart ? C.primary : C.border}`,
                  background: inCart ? C.primary : '#fff',
                  color: inCart ? C.onPrimary : C.primary,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s, transform 0.18s',
                  transform: justAdded ? 'scale(1.1)' : 'scale(1)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {inCart ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="20" r="1.4" fill="currentColor" />
                    <circle cx="18" cy="20" r="1.4" fill="currentColor" />
                    <path d="M2.5 3h2.6l2.4 12.1a2 2 0 0 0 2 1.6h9.3a2 2 0 0 0 2-1.55L22.5 7H6.3" />
                  </svg>
                )}
              </button>
            )
          })()}

          <button
            onClick={() => router.push(`${base}/checkout?productId=${product.id}`)}
            style={{
              flex: 1,
              background: C.primary,
              border: 'none', borderRadius: 100,
              padding: '15px',
              color: C.onPrimary,
              fontSize: 16, fontWeight: 800,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              boxShadow: `0 4px 14px ${C.primary}40`,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            立即購買
          </button>
        </div>

        {/* Toast: just added */}
        {justAdded && (
          <div style={{
            position: 'absolute',
            top: -52, left: '50%',
            transform: 'translateX(-50%)',
            background: '#1a1a1a',
            color: '#fff',
            fontSize: 13, fontWeight: 600,
            padding: '10px 18px',
            borderRadius: 100,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            whiteSpace: 'nowrap',
            animation: 'pdToast 1.2s ease',
            pointerEvents: 'none',
          }}>已加入購物車</div>
        )}
        <style>{`
          @keyframes pdToast {
            0% { opacity: 0; transform: translate(-50%, 10px); }
            15% { opacity: 1; transform: translate(-50%, 0); }
            85% { opacity: 1; transform: translate(-50%, 0); }
            100% { opacity: 0; transform: translate(-50%, -10px); }
          }
        `}</style>
      </div>
    </div>
  )
}
