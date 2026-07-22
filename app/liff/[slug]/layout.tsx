import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { LiffProvider } from '@/components/liff/LiffProvider'
import LiffBottomNav from '@/components/liff/LiffBottomNav'
import { TenantProvider } from '@/components/liff/TenantContext'
import { CartProvider } from '@/components/liff/CartProvider'
import FloatingCart from '@/components/liff/FloatingCart'
import { getTenantBySlug } from '@/lib/services/tenant'
import { S, FONT } from '@/lib/liff/tokens'

interface Props {
  children: ReactNode
  params: Promise<{ slug: string }>
}

// 標題用後台設定的品牌名稱（取代 Next.js 預設的 "Create Next App"）
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)
  return { title: tenant?.brandName ?? 'eSIM' }
}

export default async function TenantLiffLayout({ children, params }: Props) {
  const { slug } = await params
  const tenant = await getTenantBySlug(slug)

  if (!tenant) notFound()

  return (
    <TenantProvider tenant={tenant}>
      <LiffProvider liffId={tenant.liffId} tenantSlug={slug}>
        <CartProvider>
          <div className="min-h-screen pb-16 liff-root" style={{ background: S.bg, fontFamily: FONT }}>
            {/* 全站按壓回饋的單一來源：任何點下去該有反應的按鈕/列加上 className="liff-press"
                即得輕微縮放＋降透明。補上 next/router 切換前那 100~300ms 的「按了沒反應」感，
                touch-action 順帶砍掉 iOS 300ms tap delay。 */}
            <style>{`.liff-press{-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:transform 120ms ease,opacity 120ms ease}.liff-press:active{transform:scale(0.97);opacity:0.9}`}</style>
            {children}
          </div>
          <FloatingCart />
          <LiffBottomNav />
        </CartProvider>
      </LiffProvider>
    </TenantProvider>
  )
}
