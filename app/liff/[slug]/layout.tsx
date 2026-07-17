import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { LiffProvider } from '@/components/liff/LiffProvider'
import LiffBottomNav from '@/components/liff/LiffBottomNav'
import { TenantProvider } from '@/components/liff/TenantContext'
import { CartProvider } from '@/components/liff/CartProvider'
import FloatingCart from '@/components/liff/FloatingCart'
import { getTenantBySlug } from '@/lib/services/tenant'

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
          <div className="min-h-screen pb-16 liff-root" style={{ background: '#f9f9f9' }}>
            {children}
          </div>
          <FloatingCart />
          <LiffBottomNav />
        </CartProvider>
      </LiffProvider>
    </TenantProvider>
  )
}
