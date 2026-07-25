import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminCredentials } from '@/lib/services/platform-admin'
import { createPlatformSession, PLATFORM_COOKIE, PLATFORM_SESSION_TTL } from '@/lib/auth/platform'
import { checkRateLimit } from '@/lib/utils/rate-limit'

// 後台登入是對外開放的最高權限入口，必須擋暴力破解。兩層 bucket：
//   per-IP   10 次 / 5 分鐘  —— 擋單一來源狂試
//   per-帳號 20 次 / 15 分鐘 —— 擋分散式來源鎖定單一帳號。門檻刻意放寬，
//                              避免被惡意打滿而把管理員自己鎖在門外。
// 限流器自身失效時一律放行並記 log（見 checkRateLimit 註解：曾因 fail-closed
// 加上 rate_limits 表不存在，導致後台永遠 429、管理員被鎖在門外）。
const RATE = {
  ip:      { limit: 10, windowSec: 5 * 60 },
  account: { limit: 20, windowSec: 15 * 60 },
}

// Vercel 邊緣會設 x-real-ip；x-forwarded-for 首段可被用戶端偽造，僅作為後備。
function clientIp(req: NextRequest): string {
  return req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
}

// POST /api/platform/auth/login
export async function POST(req: NextRequest) {
  // req.json() 對空 body／壞 JSON 會丟例外——兜住回 400，不讓它變成難看的 500
  // （其他登入路由同作法）。
  const body = await req.json().catch(() => null)
  const { email, password, rememberMe } = body ?? {}

  if (!email || !password) {
    return NextResponse.json({ error: '帳號與密碼必填' }, { status: 400 })
  }

  // 帳號 bucket 的 key 與 verifyAdminCredentials 的查詢一樣做 trim + 小寫，
  // 否則大小寫變形就能各自拿到一份額度。
  const ip = clientIp(req)
  const account = String(email).trim().toLowerCase()
  const [ipOk, accountOk] = await Promise.all([
    checkRateLimit(`admin-login:ip:${ip}`, RATE.ip.limit, RATE.ip.windowSec),
    checkRateLimit(`admin-login:acct:${account}`, RATE.account.limit, RATE.account.windowSec),
  ])
  if (!ipOk || !accountOk) {
    // 記到 Vercel log 供事後追查；不寫 system_alerts，避免持續攻擊灌爆告警表。
    console.warn('[platform/auth/login] rate limited', { ip, scope: ipOk ? 'account' : 'ip' })
    return NextResponse.json({ error: '嘗試次數過多，請稍後再試' }, { status: 429 })
  }

  let admin
  try {
    admin = await verifyAdminCredentials(email, password)
  } catch (err) {
    // 不可靜默吞錯（CLAUDE.md F）：把真實原因記到 Vercel function log，
    // 方便排查（例如 serverless 冷啟動時的 DB 連線失敗）。
    console.error('[platform/auth/login] verifyAdminCredentials failed:', err)
    return NextResponse.json({ error: '伺服器錯誤，請稍後再試' }, { status: 500 })
  }
  if (!admin) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
  }

  // 單一 ttl 同時決定 JWT 到期與 cookie maxAge，兩者不再各自寫死（見先前「記住我」bug）。
  const ttlSec = rememberMe ? PLATFORM_SESSION_TTL.remember : PLATFORM_SESSION_TTL.default
  const token = await createPlatformSession({
    adminId: admin.id,
    role: admin.role,
  }, ttlSec)

  const res = NextResponse.json({
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  })

  res.cookies.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ttlSec,   // 勾記住我 7 天、否則 8 小時（與 JWT 同一來源）
    path: '/',
  })

  return res
}
