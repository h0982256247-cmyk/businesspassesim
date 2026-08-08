'use client'

// 平台/社群管理員登入表單（單一來源）。
// 兩個入口共用：主網域首頁 app/_home/HomeLogin 與後台重登頁 app/platform/login。
// 抽出的原因：兩頁原本各寫一份幾乎相同的表單，導致「記住我」天數等文案漂移
// （曾一邊寫 30 天、一邊寫 7 天）。表單欄位、記住我文案、登入 API 與成功導向都以此檔為準。

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginForm() {
  const router = useRouter()
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // 直接讀表單當下的值，確保密碼管理員／瀏覽器「自動填入」的內容一定被抓到，
    // 不依賴可能還沒同步的 React state（否則第一次送出可能送到空值／舊值 → 401）。
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim()
    const password = String(fd.get('password') ?? '')

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
    // 平台/社群管理員（SUPER_ADMIN 等）一律進 /platform，後台再依角色顯示功能。
    router.replace('/platform')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm text-gray-600 block mb-1">電子郵件</label>
        <input
          type="email"
          name="email"
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
          name="password"
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
          onChange={e => setRememberMe(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
        <label htmlFor="rememberMe" className="text-sm text-gray-600 cursor-pointer select-none">
          記住我（7 天免登入）
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
  )
}
