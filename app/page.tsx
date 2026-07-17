// 主網域 ('/') 入口（server component）：
// - 若 Host 是某白牌的「自訂網域」→ server 端直接 redirect 到該租戶 LIFF（/liff/<slug>），
//   自訂網域會保留在網址列，之後整個 LIFF 流程都走 /liff/<slug>/...。
// - 否則 → 顯示後台統一登入頁（HomeLogin，client）。
//
// host→tenant 解析放在這裡（node runtime、可用 Prisma），不放在 edge proxy.ts，
// 避免動到 API auth gate 也避免 edge 不能用 Prisma 的限制。

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTenantByDomain } from '@/lib/services/tenant'
import HomeLogin from './_home/HomeLogin'

export default async function HomePage() {
  const host = (await headers()).get('host') ?? ''
  // 預設網域 / 本機開發不必查 DB；只有可能是自訂網域時才解析。
  if (host && !host.endsWith('.vercel.app') && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    const tenant = await getTenantByDomain(host)
    if (tenant?.slug) redirect(`/liff/${tenant.slug}`)
  }
  return <HomeLogin />
}
