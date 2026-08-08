'use client'

// 後台管理員「重新登入」頁：/platform/* 頁面在 session 失效時會被導來這裡
// （見 app/platform/layout.tsx 與各頁 401 處理）。登入表單本體共用
// components/platform/AdminLoginForm（與主網域首頁 app/_home/HomeLogin 同一份，
// 避免兩邊各寫一份導致文案漂移）。

import AdminLoginForm from '@/components/platform/AdminLoginForm'

export default function PlatformLoginPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1">平台管理後台</h1>
        <p className="text-sm text-gray-400 text-center mb-6">請以管理員帳號登入</p>

        <AdminLoginForm />
      </div>
    </div>
  )
}
