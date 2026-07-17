import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { verifyPlatformSession, PLATFORM_COOKIE } from '@/lib/auth/platform'

// 完全公開（無需任何驗證）
//   /api/auth/line        — LINE 登入用
//   /api/tenant/          — Tenant 公開設定（前台讀取品牌、模板等）
//   /api/platform/auth/   — Platform admin 登入
//   /api/webhooks/        — 第三方 (WM 等) push 過來的 callback，由 route 內部驗證 payload
//   /api/payment/tappay/notify — TapPay 金流結果 callback（server→server、無 cookie），
//                          route 內部以 x-api-key (partner_key) 驗章。沒放行的話
//                          proxy 會在 route 之前回 401，訂單永遠卡在 PROCESSING。
//                          ⚠ 只放行 /notify 子路徑；父路徑 /api/payment/tappay（前端
//                          發動扣款）仍需 session，不可放行。
//   /api/cron/            — Vercel Cron，由 route 內部驗證 CRON_SECRET
//   /api/gifts/           — 轉贈連結預覽 (GET 不需登入)；claim 子路徑由 route 內部驗 session
const PUBLIC_API = [
  '/api/auth/line',
  '/api/tenant/',
  '/api/platform/auth/',
  '/api/webhooks/',
  '/api/payment/tappay/notify',
  '/api/cron/',
  '/api/gifts/',
]

// 平台後台路由前綴（使用 PLATFORM_COOKIE 驗證）
// /api/platform/* 為新式命名；/api/admin/* 為舊式命名，路由內部同樣使用 requirePlatformAuth
const isPlatformRoute = (p: string) =>
  p.startsWith('/api/platform/') || p.startsWith('/api/admin/')

// 舊版 (liff) 群組路徑（已刪除）的 deep link 全部 302 redirect 到主網域
// 登入頁，附 ?from=<原路徑> 顯示「您剛從 X 被導離」提示。LIFF 一律走
// /liff/<slug>/...，所有租戶設定（金流、發票、eSIM）跟著 slug。group-admin
// 也已搬到 /liff/<slug>/group-admin，舊 bookmark 走這條 redirect。
const OLD_LIFF_PATHS = [
  '/products',
  '/orders',
  '/checkout',
  '/profile',
  '/coupons',
  '/group',
  '/support',
  '/gift',
  '/group-admin',
]

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // 1) 非 API 路徑 → 檢查是否為舊 LIFF deep link，命中就 redirect 到登入頁
  if (!pathname.startsWith('/api/')) {
    const hit = OLD_LIFF_PATHS.some(
      p => pathname === p || pathname.startsWith(`${p}/`)
    )
    if (hit) {
      const url = req.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('from', pathname + (search ?? ''))
      return NextResponse.redirect(url, 302)
    }
    return NextResponse.next()
  }

  // 白名單放行
  if (PUBLIC_API.some(p => pathname.startsWith(p))) return NextResponse.next()

  // 平台後台路由 → 驗證 PLATFORM_COOKIE
  if (isPlatformRoute(pathname)) {
    const token = req.cookies.get(PLATFORM_COOKIE)?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      await verifyPlatformSession(token)
      return NextResponse.next()
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
  }

  // 一般 LIFF 使用者路由 → 驗證 SESSION_COOKIE
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await verifySession(token)
    return NextResponse.next()
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}

export const config = {
  // 兩個職責：API auth gate + 舊 LIFF URL redirect。
  // 排除 _next 內部、靜態資源、liff、platform 路徑；其餘讓 proxy 跑、
  // function 內部依 pathname.startsWith('/api/') 分流。
  matcher: [
    '/((?!_next/|liff/|platform/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)).*)',
  ],
}
