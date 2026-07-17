import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { issueActivityCoupon } from '@/lib/services/group'

// POST /api/groups/coupons — 社群主發送活動券
// Body: { memberUserIds, discount, expiresAt? }
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const group = await prisma.group.findUnique({
    where: { ownerId: session.userId },
    select: { id: true, status: true },
  })

  if (!group || group.status !== 'APPROVED') {
    return NextResponse.json({ error: '無社群主權限' }, { status: 403 })
  }

  const { memberUserIds, discount, expiresAt } = await req.json()

  if (!Array.isArray(memberUserIds) || memberUserIds.length === 0) {
    return NextResponse.json({ error: 'memberUserIds 不可為空' }, { status: 400 })
  }
  if (typeof discount !== 'number') {
    return NextResponse.json({ error: 'discount 必填' }, { status: 400 })
  }

  try {
    await issueActivityCoupon(
      group.id,
      session.userId,
      memberUserIds,
      discount,
      expiresAt ? new Date(expiresAt) : undefined
    )
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '發券失敗' }, { status: 422 })
  }
}
