'use client'

// 主網域 ('/') 的統一登入頁（client 部分）：
// - 平台/社群管理員（PLATFORM_ADMIN / SUB_ADMIN / SUPER_ADMIN）→ /platform
// - 社群主（GROUP_OWNER，LINE 登入）→ 從自己的 LIFF 進入後底部 Tab 才有「後台」
//
// host 為白牌自訂網域時，會在 server 端（app/page.tsx）先 redirect 到該租戶 LIFF，
// 不會走到這頁。

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function HomeLogin() {
  return (
    <Suspense fallback={null}>
      <HomeLoginInner />
    </Suspense>
  )
}

function HomeLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // proxy redirect 後會帶 ?from=<舊路徑>，方便我們顯示「您剛被導離 /xxx」
  const from = searchParams.get('from')

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [rememberMe, setRemember] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let r: { admin?: { role?: string }; error?: string } = {}
    try {
      r = await fetch('/api/platform/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      }).then(x => x.json())
    } catch {
      setError('網路錯誤，請稍候再試')
      setLoading(false)
      return
    }

    setLoading(false)

    if (!r.admin) {
      setError(r.error ?? '登入失敗')
      return
    }
    // PLATFORM_ADMIN / SUB_ADMIN / SUPER_ADMIN 都進 /platform，後台再依角色顯示功能。
    router.replace('/platform')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {from && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
            您剛從 <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">{from}</code> 被導離 — 此網址已不再使用，請從你的品牌 LIFF 或下方後台登入進入。
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center mb-1">後台登入</h1>
          <p className="text-sm text-gray-400 text-center mb-6">平台 / 社群管理員</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">電子郵件</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">密碼</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">
                記住我（30 天免登入）
              </label>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition"
            >
              {loading ? '登入中…' : '登入'}
            </button>
          </form>
        </div>

        {/* 社群主登入導引 — 沒 email/password，要從 LINE 開 LIFF 進入 */}
        <div className="mt-4 bg-white/70 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 leading-relaxed text-center">
          <p className="font-semibold text-slate-700 mb-1">社群主後台？</p>
          <p>請在 LINE 內開啟你的品牌 LIFF，登入後從底部「後台」進入。</p>
        </div>
      </div>
    </div>
  )
}
