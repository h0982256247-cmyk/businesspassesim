import { NextRequest, NextResponse } from 'next/server'
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session'
import { prisma } from '@/lib/db/prisma'
import { encrypt } from '@/lib/utils/crypto'
import { getRebateCeiling } from '@/lib/services/group'

// PATCH /api/groups/settings — 社群主更新讓利比例 / 基本設定
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let session
  try { session = await verifySession(token) } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  const group = await prisma.group.findUnique({
    where: { ownerId: session.userId },
    select: { id: true, status: true, tenantAdminId: true },
  })

  if (!group || group.status !== 'APPROVED') {
    return NextResponse.json({ error: '無社群主權限或社群尚未核准' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.rebateRate === 'number') {
    // 上限跟租戶 maxRebateRate 走（與平台後台 adminSetRebateRate 同一來源），
    // 不再寫死 30%，避免社群主自調超過租戶設定的上限。
    const ceiling = await getRebateCeiling(group.tenantAdminId)
    if (body.rebateRate < 0 || body.rebateRate > ceiling) {
      return NextResponse.json({ error: `讓利比例須介於 0 ~ ${(ceiling * 100).toFixed(0)}%` }, { status: 400 })
    }
    updates.rebateRate = body.rebateRate
  }

  // 銀行欄位加密儲存（bankName 為公開資訊不加密）
  if (body.bankName !== undefined) updates.bankName = body.bankName
  // 帳號回給社群主時是遮罩（••••末四碼）；若原封送回代表沒改 → 保留現有加密值，
  // 不可把遮罩字串加密蓋掉真實帳號。
  if (body.bankAccount !== undefined) {
    const v = typeof body.bankAccount === 'string' ? body.bankAccount : ''
    if (!v.startsWith('••••')) updates.bankAccount = v ? encrypt(v) : null
  }
  if (body.bankBranch !== undefined)     updates.bankBranch     = body.bankBranch     ? encrypt(body.bankBranch)     : null
  if (body.bankHolderName !== undefined) updates.bankHolderName = body.bankHolderName ? encrypt(body.bankHolderName) : null
  if (body.description !== undefined) updates.description = body.description

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
  }

  const updated = await prisma.group.update({
    where: { id: group.id },
    data: updates,
  })

  return NextResponse.json({ group: updated })
}
