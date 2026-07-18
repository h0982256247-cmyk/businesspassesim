import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getManagedCompany } from '@/lib/services/group'

// GET /api/company-admin — 企業管理員（LIFF）取自己管理的企業 + 成員清單（待審在前）
export async function GET(req: NextRequest) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const managed = await getManagedCompany(auth.userId)
  if (!managed) return NextResponse.json({ error: '你不是任何企業的管理員' }, { status: 403 })

  return NextResponse.json(managed)
}
