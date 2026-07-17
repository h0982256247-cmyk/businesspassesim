import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { adminSetRebateRate, adminSetMonthlyCouponQuota } from '@/lib/services/group'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/groups/:id — 設定讓利比例（受 maxRebateRate 限制）或每月發券上限
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const { rebateRate, monthlyCouponQuota } = await req.json()

  try {
    if (typeof monthlyCouponQuota === 'number') {
      await adminSetMonthlyCouponQuota(id, monthlyCouponQuota, auth.tenantAdminId)
      return NextResponse.json({ ok: true })
    }
    if (typeof rebateRate === 'number') {
      await adminSetRebateRate(id, rebateRate, auth.tenantAdminId)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: '請提供 rebateRate 或 monthlyCouponQuota' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 })
  }
}
