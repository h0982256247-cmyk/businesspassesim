'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

type Coupon = {
  id: string
  type: string
  discount: number
  expiresAt: string | null
  isOfficial: boolean
  sourceGroup: { name: string } | null
}

type Order = {
  id: string
  status: string
  totalPaid: number
  createdAt: string
  paidAt: string | null
  esimCount: number
  bundleTotal: number
  orderItems: { productName: string }[]
}

type UserDetail = {
  id: string
  lineUid: string
  displayName: string
  realName: string | null
  avatarUrl: string | null
  phone: string | null
  email: string | null
  birthday: string | null
  createdAt: string
  tenantAdminId: string | null
  tenantAdmin: { id: string; name: string; brandName: string | null } | null
  ownedGroup: { id: string; name: string; status: string; inviteCode: string } | null
  groupMembership: { joinedAt: string; group: { id: string; name: string } } | null
  coupons: Coupon[]
  orders: Order[]
}

const STATUS_META: Record<string, { text: string; bg: string; color: string }> = {
  PENDING:      { text: '待付款',      bg: '#fef9c3', color: '#a16207' },
  PROCESSING:   { text: '待付款',      bg: '#fef9c3', color: '#a16207' },
  PAID:         { text: '付款成功',    bg: '#dcfce7', color: '#15803d' },
  COMPLETED:    { text: '已完成發送',  bg: '#dcfce7', color: '#15803d' },
  FAILED:       { text: '付款失敗',    bg: '#fee2e2', color: '#b91c1c' },
  ESIM_PENDING: { text: '待發送',     bg: '#fff7ed', color: '#c2410c' },
  REFUNDED:     { text: '已退款',      bg: '#f1f5f9', color: '#475569' },
}

const COUPON_LABEL: Record<string, string> = {
  OFFICIAL_WELCOME: '官方歡迎券',
  GROUP_JOIN:       '入群券',
  GROUP_OWNER:      '社群主專屬',
  CUSTOM:           '自訂折扣券',
}

const TABS = ['基本資料', '優惠券', '訂單紀錄'] as const
type Tab = typeof TABS[number]

export default function UserDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('基本資料')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/users/${id}`)
      if (res.status === 401) { router.replace('/platform/login'); return }
      if (res.status === 403 || res.status === 404) { router.replace('/platform/users'); return }
      const d = await res.json()
      if (d.user) setUser(d.user)
    } catch (e) {
      console.error('User detail load error:', e)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  // 後台一鍵升級為社群主：跳過自助申請流程，直接建出 APPROVED 狀態的社群、
  // 發 GROUP_OWNER 7 折券、推 LINE 通知。
  const [promoting, setPromoting] = useState(false)
  const promoteToOwner = async () => {
    if (!user || promoting) return
    const name = window.prompt(`請輸入社群名稱（將作為 ${user.displayName} 的社群名）：`)
    if (!name || !name.trim()) return
    if (!window.confirm(
      `確認將「${user.displayName}」升級為社群主？\n\n` +
      `將建立社群「${name.trim()}」並核准、發 7 折社群主券、推 LINE 通知。`
    )) return
    setPromoting(true)
    try {
      const r = await fetch(`/api/platform/users/${id}/promote-to-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      }).then(x => x.json())
      if (!r.ok) {
        alert(r.error ?? '升級失敗')
        return
      }
      alert(`✅ 已升級為社群主\n邀請碼：${r.group.inviteCode}`)
      await load()
    } catch {
      alert('網路錯誤，請稍候再試')
    } finally {
      setPromoting(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return null

  const isOwner = !!user.ownedGroup
  const isMember = !!user.groupMembership && !isOwner
  const profileComplete = !!(user.realName && user.phone && user.email && user.birthday)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/platform/users')} className="text-gray-400 hover:text-gray-600 text-sm">
          ← 會員管理
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-800">{user.displayName}</h1>
        {isOwner && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">社群主</span>
        )}
        {isMember && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold">社群會員</span>
        )}
        {!profileComplete && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-semibold">資料未填</span>
        )}
        {/* 一鍵升級按鈕：只在非社群主時顯示 */}
        {!isOwner && (
          <button
            onClick={promoteToOwner}
            disabled={promoting}
            className="ml-auto text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-60"
          >
            {promoting ? '升級中…' : '⬆️ 升級為社群主'}
          </button>
        )}
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-100 flex-shrink-0" />
          : (
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 text-xl font-bold">{user.displayName.slice(0, 2)}</span>
            </div>
          )
        }
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-lg">{user.displayName}</p>
          <p className="text-xs text-gray-400 font-mono truncate">{user.lineUid}</p>
          <p className="text-xs text-gray-400 mt-1">加入於 {new Date(user.createdAt).toLocaleDateString('zh-TW')}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-blue-600">{user.orders.length}</p>
          <p className="text-xs text-gray-400">訂單</p>
          <p className="text-lg font-bold text-green-600 mt-1">{user.coupons.length}</p>
          <p className="text-xs text-gray-400">有效券</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t}
            {t === '優惠券' && user.coupons.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-600 text-xs rounded-full px-1.5 py-0.5 font-semibold">{user.coupons.length}</span>
            )}
            {t === '訂單紀錄' && user.orders.length > 0 && (
              <span className="ml-1.5 bg-gray-100 text-gray-500 text-xs rounded-full px-1.5 py-0.5 font-semibold">{user.orders.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: 基本資料 */}
      {activeTab === '基本資料' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500">個人資料</h2>
              {!profileComplete && (
                <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-lg">尚未填寫</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <InfoRow label="真實姓名" value={user.realName ?? '—'} />
              <InfoRow label="手機號碼" value={user.phone ?? '—'} />
              <InfoRow label="電子郵件" value={user.email ?? '—'} />
              <InfoRow label="生日"
                value={user.birthday ? new Date(user.birthday).toLocaleDateString('zh-TW') : '—'} />
              <InfoRow
                label="所屬平台"
                value={user.tenantAdmin ? (user.tenantAdmin.brandName || user.tenantAdmin.name) : '未分配'}
              />
              <div>
                <span className="text-gray-400 block text-xs mb-0.5">社群身份</span>
                {isOwner
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">社群主</span>
                  : isMember
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-blue-50 text-blue-600">社群會員</span>
                    : <span className="text-gray-300 font-medium">未加入</span>
                }
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-500 mb-4">社群資訊</h2>
            {isOwner && user.ownedGroup ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{user.ownedGroup.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">社群主 · 邀請碼 <span className="font-mono">{user.ownedGroup.inviteCode}</span></p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  user.ownedGroup.status === 'APPROVED' ? 'bg-green-50 text-green-600' :
                  user.ownedGroup.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-500'
                }`}>
                  {user.ownedGroup.status === 'APPROVED' ? '已核准' : user.ownedGroup.status === 'PENDING' ? '審核中' : '未通過'}
                </span>
              </div>
            ) : isMember && user.groupMembership ? (
              <div>
                <p className="font-semibold text-gray-800">{user.groupMembership.group.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  加入於 {new Date(user.groupMembership.joinedAt).toLocaleDateString('zh-TW')}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">尚未加入任何社群</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: 優惠券 */}
      {activeTab === '優惠券' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {user.coupons.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">目前沒有有效優惠券</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['類型', '折扣', '來源', '到期日'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {user.coupons.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        c.isOfficial ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {COUPON_LABEL[c.type] ?? c.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-gray-800">
                      {(() => { const n = Math.round(Number(c.discount) * 100); return n % 10 === 0 ? n / 10 : n })()}折
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {c.isOfficial ? '官方' : (c.sourceGroup?.name ?? '—')}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('zh-TW') : '永久有效'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: 訂單紀錄 */}
      {activeTab === '訂單紀錄' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {user.orders.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">目前沒有訂單紀錄</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['訂單', '商品', '狀態', '金額', '下單時間'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {user.orders.map(o => {
                  const sm = STATUS_META[o.status] ?? { text: o.status, bg: '#f1f5f9', color: '#475569' }
                  return (
                    <tr key={o.id} onClick={() => router.push(`/platform/orders/${o.id}`)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-5 py-3.5 font-mono text-xs text-blue-600">#{o.id.slice(-8).toUpperCase()}</td>
                      <td className="px-5 py-3.5 text-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[180px] truncate">{o.orderItems[0]?.productName ?? '—'}</span>
                          {o.esimCount>1&&<span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">合購 {o.esimCount} 張</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-medium px-2 py-1 rounded-full"
                          style={{ background: sm.bg, color: sm.color }}>
                          {sm.text}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                        NT${(o.esimCount>1?o.bundleTotal:o.totalPaid).toLocaleString()}
                        {o.esimCount>1&&<span className="block text-[10px] font-normal text-gray-400">{o.esimCount} 張合計</span>}
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-xs">
                        {new Date(o.createdAt).toLocaleDateString('zh-TW')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-400 block text-xs mb-0.5">{label}</span>
      <span className={`font-medium ${value === '—' ? 'text-gray-300' : 'text-gray-800'}`}>{value}</span>
    </div>
  )
}
