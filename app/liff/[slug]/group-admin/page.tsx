'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiffBase } from '@/hooks/useLiffBase'
import { useTenantColors } from '@/components/liff/TenantContext'
import PageSkeleton from '@/components/liff/PageSkeleton'

type GroupData = {
  id: string
  name: string
  status: string
  rebateRate: number
  inviteCode: string
  activityCouponQuota: number
  members: { id: string }[]
}

export default function GroupAdminDashboard() {
  const router = useRouter()
  const base = useLiffBase()
  const C = useTenantColors()
  const [group, setGroup] = useState<GroupData | null>(null)
  const [pendingBalance, setPendingBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [noAccess, setNoAccess] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/groups').then(r => r.json()),
      fetch('/api/commissions').then(r => r.json()),
    ]).then(([gd, cd]) => {
      if (!gd.ownedGroup || gd.ownedGroup.status !== 'APPROVED') {
        setNoAccess(true)
      } else {
        setGroup(gd.ownedGroup)
        setPendingBalance(cd.pendingBalance ?? 0)
      }
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="px-4 py-5"><PageSkeleton rows={4} /></div>

  if (noAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500">尚未取得社群主權限</p>
        <button onClick={() => router.push(`${base}/group`)} className="text-blue-600 text-sm underline">前往申請</button>
      </div>
    )
  }

  if (!group) return null

  return (
    <div className="px-4 py-5 space-y-4">
      <div>
        <h1 className="text-xl font-bold">{group.name}</h1>
        <p className="text-xs text-gray-400">邀請碼：<span className="font-mono font-bold">{group.inviteCode}</span></p>
      </div>

      {/* 本月累積分潤（醒目）+ 進入收益明細/提領 */}
      <button
        onClick={() => router.push(`${base}/group-admin/revenue`)}
        className="w-full text-left rounded-2xl p-5 shadow-sm"
        style={{ background: C.primary }}
      >
        <p className="text-xs" style={{ color: C.onPrimary, opacity: 0.85 }}>本月累積分潤（待結算）</p>
        <p className="text-3xl font-extrabold mt-1" style={{ color: C.onPrimary }}>NT${pendingBalance.toLocaleString()}</p>
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.onPrimary}33` }}>
          <span className="text-xs" style={{ color: C.onPrimary, opacity: 0.85 }}>每月分潤查詢 · 申請提領與進度</span>
          <span className="text-sm font-semibold" style={{ color: C.onPrimary }}>收益明細與提領 ›</span>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">社群成員</p>
          <p className="text-2xl font-bold text-gray-800">{group.members?.length ?? 0} 人</p>
        </div>
        <button onClick={() => router.push(`${base}/group-admin/settings`)} className="bg-white rounded-xl border p-4 shadow-sm text-left">
          <p className="text-xs text-gray-400 mb-1">讓利比例</p>
          <p className="text-2xl font-bold text-gray-800">{Math.round(Number(group.rebateRate) * 100)}%</p>
          <p className="text-xs font-semibold mt-1" style={{ color: C.primaryText }}>調整 ›</p>
        </button>
        <button onClick={() => router.push(`${base}/group-admin/coupons`)} className="bg-white rounded-xl border p-4 shadow-sm text-left">
          <p className="text-xs text-gray-400 mb-1">本月發券剩餘</p>
          <p className="text-2xl font-bold text-gray-800">{group.activityCouponQuota} 次</p>
          <p className="text-xs font-semibold mt-1" style={{ color: C.primaryText }}>前往發券 ›</p>
        </button>
        <button onClick={() => router.push(`${base}/group-admin/revenue`)} className="bg-white rounded-xl border p-4 shadow-sm text-left">
          <p className="text-xs text-gray-400 mb-1">提領</p>
          <p className="text-base font-bold mt-1" style={{ color: C.primaryText }}>查看 / 申請 ›</p>
        </button>
      </div>
    </div>
  )
}
