import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { getReceiptForUser, fillReceiptInfo, type ReceiptType, type FillResult } from '@/lib/services/receipt'

const ERR_MSG: Record<Extract<FillResult, { ok: false }>['error'], string> = {
  NOT_FOUND: '收據不存在',
  LOCKED: '此收據已填寫買受人資料，無法再修改',
  NOT_COMPANY_ORDER: '此訂單非企業訂單，無法開立公司收據',
  COMPANY_INFO_MISSING: '該企業尚未設定統一編號，請聯繫管理員',
}

// GET /api/receipts/:id — 取回本人收據
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const receipt = await getReceiptForUser(auth.userId, id)
  if (!receipt) return NextResponse.json({ error: '收據不存在' }, { status: 404 })
  return NextResponse.json({ receipt })
}

// PATCH /api/receipts/:id — 填寫買受人資訊（個人／公司）；填完鎖定
// Body: { type: 'personal'|'company', companyTitlePersonal?: boolean }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const type: ReceiptType = body.type === 'company' ? 'company' : 'personal'

  const result = await fillReceiptInfo(auth.userId, id, { type, companyTitlePersonal: body.companyTitlePersonal === true })
  if (!result.ok) {
    const status = result.error === 'NOT_FOUND' ? 404 : result.error === 'LOCKED' ? 409 : 422
    return NextResponse.json({ error: ERR_MSG[result.error] }, { status })
  }
  return NextResponse.json({ receipt: result.receipt })
}
