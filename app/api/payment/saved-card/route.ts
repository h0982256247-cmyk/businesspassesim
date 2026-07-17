import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'

const CARD_TYPE_LABEL: Record<number, string> = {
  1: 'VISA',
  2: 'MasterCard',
  3: 'JCB',
  4: 'UnionPay',
  5: 'AMEX',
}

// GET /api/payment/saved-card
// Returns: { savedCard: { lastFour, cardType, cardTypeLabel, expiresAt } | null }
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const saved = await prisma.savedCard.findUnique({
    where: { userId: session.userId },
    select: { lastFour: true, cardType: true, funding: true, cardExpiresAt: true },
  })

  if (!saved) return NextResponse.json({ savedCard: null })

  return NextResponse.json({
    savedCard: {
      lastFour: saved.lastFour,
      cardType: saved.cardType,
      cardTypeLabel: CARD_TYPE_LABEL[saved.cardType] ?? 'Card',
      expiresAt: saved.cardExpiresAt,
    },
  })
}

// DELETE /api/payment/saved-card
// Deletes the saved card for the current user
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  await prisma.savedCard.deleteMany({ where: { userId: session.userId } })

  return NextResponse.json({ ok: true })
}
