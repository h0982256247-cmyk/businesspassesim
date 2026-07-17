'use client'

/**
 * TenantScopeBar — Super Admin 跨平台篩選器
 * 顯示全平台模式（紫色）或已篩選某平台（藍色）
 */
type Admin = { id: string; name: string; brandName: string | null }

export default function TenantScopeBar({
  admins,
  value,
  onChange,
}: {
  admins: Admin[]
  value: string
  onChange: (v: string) => void
}) {
  const selected = admins.find(a => a.id === value)
  const label = selected ? (selected.brandName ?? selected.name) : null

  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${value ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'}`}>
      {/* Icon */}
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${value ? 'bg-blue-600' : 'bg-purple-600'}`}>
        {value ? (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
          </svg>
        )}
      </div>

      {/* Label */}
      <div className="flex-1">
        <p className={`text-xs font-semibold ${value ? 'text-blue-700' : 'text-purple-700'}`}>
          {value ? `篩選中：${label}` : 'Super Admin 全平台模式'}
        </p>
        <p className={`text-xs ${value ? 'text-blue-500' : 'text-purple-500'}`}>
          {value ? '目前僅顯示該平台的資料' : '目前顯示所有 Platform Admin 的合併資料'}
        </p>
      </div>

      {/* Selector */}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`border rounded-xl px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 transition ${
          value
            ? 'border-blue-300 bg-white text-blue-700 focus:ring-blue-100'
            : 'border-purple-300 bg-white text-purple-700 focus:ring-purple-100'
        }`}
      >
        <option value="">全部平台</option>
        {admins.map(a => (
          <option key={a.id} value={a.id}>{a.brandName ?? a.name}</option>
        ))}
      </select>
    </div>
  )
}
