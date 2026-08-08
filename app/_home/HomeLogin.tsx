'use client'

// 主網域 ('/') 的統一登入頁（client 部分）：
// - 平台/社群管理員（PLATFORM_ADMIN / SUB_ADMIN / SUPER_ADMIN）→ /platform
// - 社群主（GROUP_OWNER，LINE 登入）→ 從自己的 LIFF 進入後底部 Tab 才有「後台」
//
// host 為白牌自訂網域時，會在 server 端（app/page.tsx）先 redirect 到該租戶 LIFF，
// 不會走到這頁。
//
// 登入表單本體共用 components/platform/AdminLoginForm（與 /platform/login 同一份，
// 避免兩邊各寫一份導致「記住我」等文案漂移）。

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AdminLoginForm from '@/components/platform/AdminLoginForm'

export default function HomeLogin() {
  return (
    <Suspense fallback={null}>
      <HomeLoginInner />
    </Suspense>
  )
}

function HomeLoginInner() {
  const searchParams = useSearchParams()
  // proxy redirect 後會帶 ?from=<舊路徑>，方便我們顯示「您剛被導離 /xxx」
  const from = searchParams.get('from')

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

          <AdminLoginForm />
        </div>

        {/* 企業管理員導引 — 走 LINE LIFF，非此後台（此後台為商務通平台管理者用） */}
        <div className="mt-4 bg-white/70 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 leading-relaxed text-center">
          <p className="font-semibold text-slate-700 mb-1">企業管理員？</p>
          <p>請在 LINE 內開啟商務通 LIFF，登入後從底部「管理」分頁審核成員。</p>
        </div>
      </div>
    </div>
  )
}
