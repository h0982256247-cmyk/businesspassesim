// 後台列表頁三態：載入 / 空 / 錯誤。統一各頁重複的 spinner，並補上原本缺少的錯誤狀態
// （過去後端一掛就卡在轉圈或空白，使用者不知發生什麼）。ErrorState 樣式對齊儀表板既有錯誤卡。

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-gray-400 text-sm">{title}</p>
      {hint && <p className="text-gray-300 text-xs mt-1">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="bg-white border border-red-100 rounded-2xl shadow-sm p-6 max-w-sm w-full text-center">
        <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-700">{message ?? '載入失敗，請稍後再試'}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition">
            重新載入
          </button>
        )}
      </div>
    </div>
  )
}
