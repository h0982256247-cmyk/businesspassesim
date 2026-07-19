'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useParams } from 'next/navigation'
import { useCart, cartItemPrice } from '@/components/liff/CartProvider'
import { useTenantColors } from '@/components/liff/TenantContext'
import { CountryFlag } from '@/components/common/CountryFlag'
import { NetworkBadge, NativeSimBadge } from '@/components/liff/ProductBadges'

// Pages where the floating cart should NOT appear
const HIDE_ON = ['/checkout', '/profile/setup', '/login', '/gift/']

function CartIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" fill="currentColor" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" />
      <path d="M2.5 3h2.6l2.4 12.1a2 2 0 0 0 2 1.6h9.3a2 2 0 0 0 2-1.55L22.5 7H6.3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export default function FloatingCart() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ slug?: string }>()
  const slug = params?.slug ?? ''
  const C = useTenantColors()
  const { items, count, totalQty, subtotal, remove, setQty, hydrated } = useCart()
  const [open, setOpen] = useState(false)
  const [bumped, setBumped] = useState(false)

  // Bump animation when qty count increases
  const [prevTotalQty, setPrevTotalQty] = useState(totalQty)
  useEffect(() => {
    if (totalQty > prevTotalQty) {
      setBumped(true)
      const t = setTimeout(() => setBumped(false), 380)
      return () => clearTimeout(t)
    }
    setPrevTotalQty(totalQty)
  }, [totalQty, prevTotalQty])

  // Lock body scroll when drawer open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!hydrated) return null
  if (HIDE_ON.some(p => pathname.includes(p))) return null
  if (count === 0 && !open) return null

  // Pages with their own sticky bottom CTA: raise the FAB to clear it.
  const hasStickyCta = /\/products\/[^/]+$/.test(pathname)
  const fabBottom = hasStickyCta
    ? 'calc(160px + env(safe-area-inset-bottom))'
    : 'calc(72px + env(safe-area-inset-bottom))'

  const goSingleCheckout = (productId: string) => {
    setOpen(false)
    const url = slug ? `/liff/${slug}/checkout?productId=${productId}` : `/checkout?productId=${productId}`
    router.push(url)
  }

  // 多張 / 數量 > 1：導向統一結帳頁（不帶 productId → bundle 模式），
  // 建立訂單與刷卡都在 /checkout 內完成，購物車於成功付款後清空。
  const goBundleCheckout = () => {
    if (items.length === 0) return
    setOpen(false)
    const url = slug ? `/liff/${slug}/checkout?bundle=1` : `/checkout?bundle=1`
    router.push(url)
  }

  const badgeNumber = totalQty > 0 ? totalQty : count

  // 無優惠券系統：應付 = 小計（subtotal 已含身分定價：企業會員福利價 / 一般價）
  const bestPrice = subtotal

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`購物車（${totalQty} 張 eSIM）`}
        style={{
          position: 'fixed',
          right: 16,
          bottom: fabBottom,
          width: 56, height: 56,
          borderRadius: '50%',
          border: 'none',
          background: C.primary,
          color: C.onPrimary,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 8px 22px ${C.primary}55, 0 2px 6px rgba(0,0,0,0.12)`,
          zIndex: 45,
          transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          transform: bumped ? 'scale(1.12)' : 'scale(1)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <CartIcon size={24} />
        {badgeNumber > 0 && (
          <span style={{
            position: 'absolute',
            top: -4, right: -4,
            minWidth: 22, height: 22,
            padding: '0 6px',
            borderRadius: 11,
            background: '#ef4444',
            color: '#fff',
            fontSize: 12, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff',
            lineHeight: 1,
          }}>{badgeNumber > 99 ? '99+' : badgeNumber}</span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.5)',
            zIndex: 100,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            animation: 'fcFadeIn 0.18s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520,
              background: '#fff',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              maxHeight: '88vh',
              display: 'flex', flexDirection: 'column',
              paddingBottom: 'env(safe-area-inset-bottom)',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
              animation: 'fcSlideUp 0.26s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
            </div>

            {/* Header */}
            <div style={{
              padding: '8px 20px 12px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', margin: 0, letterSpacing: '-0.01em' }}>購物車</h2>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  {count} 項 · 共 {totalQty} 張
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: 32, height: 32, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#64748b',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                  <div style={{ marginBottom: 12, opacity: 0.5 }}><CartIcon size={42} /></div>
                  <p style={{ fontSize: 14, margin: 0 }}>購物車是空的</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.slice().sort((a, b) => b.addedAt - a.addedAt).map(item => {
                    const lineTotal = cartItemPrice(item) * item.qty
                    return (
                      <div
                        key={item.productId}
                        style={{
                          display: 'flex', alignItems: 'stretch', gap: 12,
                          padding: '12px 14px',
                          borderRadius: 14,
                          background: '#f9fafb',
                          border: '1px solid rgba(15,23,42,0.05)',
                        }}
                      >
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                          background: C.light,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <CountryFlag code={item.countryCode} fallbackEmoji={item.countryFlag} size={34} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.countryNameZh}
                          </p>
                          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                            {item.displayDays} 天{item.dataCapacity ? ` · ${item.dataCapacity}` : ''}
                          </p>
                          {(item.networkType || item.isNativeSim) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              <NetworkBadge networkType={item.networkType} />
                              <NativeSimBadge isNative={item.isNativeSim} />
                            </div>
                          )}

                          {/* Qty stepper + price/remove row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                            <div style={{
                              display: 'inline-flex', alignItems: 'center',
                              background: '#fff', border: '1px solid rgba(15,23,42,0.08)',
                              borderRadius: 100,
                              overflow: 'hidden',
                            }}>
                              <button
                                type="button"
                                aria-label="減少數量"
                                onClick={() => item.qty <= 1 ? remove(item.productId) : setQty(item.productId, item.qty - 1)}
                                style={{
                                  width: 28, height: 28,
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: item.qty <= 1 ? '#cbd5e1' : '#1a1a1a',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                {item.qty <= 1 ? <TrashIcon /> : <MinusIcon />}
                              </button>
                              <span style={{
                                minWidth: 22,
                                textAlign: 'center',
                                fontSize: 13, fontWeight: 700, color: '#1a1a1a',
                                fontVariantNumeric: 'tabular-nums',
                              }}>{item.qty}</span>
                              <button
                                type="button"
                                aria-label="增加數量"
                                onClick={() => setQty(item.productId, item.qty + 1)}
                                disabled={item.qty >= 9}
                                style={{
                                  width: 28, height: 28,
                                  background: 'none', border: 'none',
                                  cursor: item.qty >= 9 ? 'not-allowed' : 'pointer',
                                  color: item.qty >= 9 ? '#cbd5e1' : '#1a1a1a',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                <PlusIcon />
                              </button>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: 14, fontWeight: 800, color: C.primary, margin: 0, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                                NT${lineTotal.toLocaleString()}
                              </p>
                              {item.qty > 1 && (
                                <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                                  NT${cartItemPrice(item).toLocaleString()} × {item.qty}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div style={{
                borderTop: '1px solid rgba(15,23,42,0.06)',
                padding: '14px 20px 18px',
                background: '#fff',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, color: '#64748b' }}>
                  <span>共 {totalQty} 張 eSIM</span>
                  <span>NT${subtotal.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 700 }}>應付</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#1a1a1a', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                    NT${bestPrice.toLocaleString()}
                  </span>
                </div>

                {/* 單張單件 → /checkout 單筆流程；多張或數量 > 1 → bundle 流程 */}
                {count === 1 && items[0] && items[0].qty === 1 ? (
                  <button
                    type="button"
                    onClick={() => goSingleCheckout(items[0].productId)}
                    style={{
                      width: '100%',
                      background: C.primary,
                      color: C.onPrimary,
                      border: 'none',
                      borderRadius: 100,
                      padding: '14px',
                      fontSize: 15, fontWeight: 800,
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      boxShadow: `0 6px 18px ${C.primary}44`,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >前往結帳 · NT${bestPrice.toLocaleString()}</button>
                ) : (
                  <button
                    type="button"
                    onClick={goBundleCheckout}
                    style={{
                      width: '100%',
                      background: C.primary,
                      color: C.onPrimary,
                      border: 'none',
                      borderRadius: 100,
                      padding: '14px',
                      fontSize: 15, fontWeight: 800,
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      boxShadow: `0 6px 18px ${C.primary}44`,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {`全部結帳 · NT$${bestPrice.toLocaleString()}`}
                  </button>
                )}

                <p style={{ fontSize: 10, color: '#94a3b8', margin: '10px 0 0', textAlign: 'center' }}>
                  一次刷卡完成 · 每張 eSIM 會獨立發送
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fcFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes fcSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
    </>
  )
}
