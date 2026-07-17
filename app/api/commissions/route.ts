import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { getGroupCommissions, getGroupSettlements, getPendingBalance } from '@/lib/services/commission'

// GET /api/commissions — 社群主查自己社群的分潤
export async function GET(req: NextRequest) {
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

  const [commissions, settlements, pendingBalance] = await Promise.all([
    getGroupCommissions(group.id),
    getGroupSettlements(group.id),
    getPendingBalance(group.id),
  ])

  return NextResponse.json({ commissions, settlements, pendingBalance })
}
