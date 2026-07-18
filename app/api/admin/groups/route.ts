import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllCompanies, createCompany, getCompanyById } from '@/lib/services/group'

// GET /api/admin/groups — 企業列表。SUPER_ADMIN 看全部；COMPANY_ADMIN 只看自己企業。
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  if (auth.role === 'COMPANY_ADMIN') {
    const company = auth.groupId ? await getCompanyById(auth.groupId) : null
    return NextResponse.json({ companies: company ? [company] : [] })
  }

  const companies = await getAllCompanies()
  return NextResponse.json({ companies })
}

// POST /api/admin/groups — 建立企業（僅 SUPER_ADMIN；自動產生邀請碼）
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== 'SUPER_ADMIN') return NextResponse.json({ error: '無權限' }, { status: 403 })

  const { name, description } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name 必填' }, { status: 400 })

  const company = await createCompany({ name: name.trim(), description })
  return NextResponse.json({ company }, { status: 201 })
}
