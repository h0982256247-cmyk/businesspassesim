import { NextRequest, NextResponse } from 'next/server'
import { requireLiffAuth } from '@/lib/auth/liff'
import { issueOrGetReceipt, type ReceiptType, type IssueResult } from '@/lib/services/receipt'

const ERR_MSG: Record<Extract<IssueResult, { ok: false }>['error'], string> = {
  NOT_FOUND: '訂單不存在或不可開立收據',
  NOT_COMPANY_ORDER: '此訂單非企業訂單，無法開立公司收據',
  COMPANY_INFO_MISSING: '該企業尚未設定統一編號，請聯繫管理員',
  NO_NAME: '請先到「個人資料」填寫姓名，再開立收據',
}

// POST /api/receipts — 開立/取回訂單收據（一訂單一收據，開立後鎖定）
// Body: { orderId, type: 'personal'|'company', companyTitlePersonal?: boolean }
export async function POST(req: NextRequest) {
  const auth = await requireLiffAuth(req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => ({}))
  const orderId = typeof body.orderId === 'string' ? body.orderId : ''
  if (!orderId) return NextResponse.json({ error: 'orderId 必填' }, { status: 400 })
  const type: ReceiptType = body.type === 'company' ? 'company' : 'personal'

  const result = await issueOrGetReceipt(auth.userId, orderId, {
    type,
    companyTitlePersonal: body.companyTitlePersonal === true,
  })
  if (!result.ok) {
    const status = result.error === 'NOT_FOUND' ? 404 : 422
    return NextResponse.json({ error: ERR_MSG[result.error] }, { status })
  }
  return NextResponse.json({ receipt: result.receipt })
}
