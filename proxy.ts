import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { verifyPlatformSession, PLATFORM_COOKIE } from '@/lib/auth/platform'

// 完全公開（無需任何驗證）
//   /api/auth/line        — LINE 登入用
//   /api/platform/auth/   — Platform admin 登入
//   /api/webhooks/        — 第三方 (WM 等) push 過來的 callback，由 route 內部驗證 payload
//   /api/payment/tappay/notify — TapPay 金流結果 callback（server→server、無 cookie），
//                          route 內部以 x-api-key (partner_key) 驗章。沒放行的話
//                          proxy 會在 route 之前回 401，訂單永遠卡在 PROCESSING。
//                          ⚠ 只放行 /notify 子路徑；父路徑 /api/payment/tappay（前端
//                          發動扣款）仍需 session，不可放行。
//   /api/cron/            — Vercel Cron，由 route 內部驗證 CRON_SECRET
const PUBLIC_API = [
  '/api/auth/line',
  '/api/platform/auth/',
  '/api/webhooks/',
  '/api/payment/tappay/notify',
  '/api/cron/',
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
  // 兩個職責：API auth gate + 舊 LIFF URL redirect，各用一條 matcher。
  //
  // ⚠ /api/* 必須獨立列一條，不能只靠下面那條萬用規則：萬用規則排除靜態資源用的
  //   `.*\.(?:svg|png|…|js)`，會讓「路徑帶副檔名」的 API 也一起被排除 —— 例如
  //   /api/orders/<id>.js 會整個跳過認證閘門（該路徑仍會命中 [id] 動態路由）。
  //   目前每支 route 都有自帶守門（requireLiffAuth / requirePlatformAuth），所以
  //   沒有實際被繞過，但少一層防護、且日後新增 route 忘記守門就會直接公開。
  matcher: [
    '/api/:path*',
    // 其餘路徑只為了舊 LIFF deep link 的 redirect。副檔名以 $ 錨定在結尾，
    // 否則路徑「中間」出現 .js 也會被誤排除（如 /a.js/b）。
    '/((?!_next/|liff/|platform/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
