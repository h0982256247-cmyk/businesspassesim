import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { getUserMembership } from '@/lib/services/group'
import { prisma } from '@/lib/db/prisma'
import { OrderStatus } from '@prisma/client'

// GET /api/groups — 取得當前使用者的企業歸屬（含審核狀態）+ 個人累積購買次數
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const [membership, purchaseCount] = await Promise.all([
    getUserMembership(session.userId),
    prisma.order.count({
      where: { userId: session.userId, status: { in: [OrderStatus.PAID, OrderStatus.COMPLETED] } },
    }),
  ])

  return NextResponse.json({ membership, purchaseCount })
}
