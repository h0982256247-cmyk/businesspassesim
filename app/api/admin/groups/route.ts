import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { getAllCompanies, createCompany } from '@/lib/services/group'

// GET /api/admin/groups — 企業列表（Super Admin 後台）
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth

  // members（僅 ADMIN 角色）攤平成 admins 陣列；管理員可多位，前台顯示第一位
  const companies = (await getAllCompanies()).map(({ members, ...c }) => ({
    ...c,
    admins: members.map(m => m.user),
  }))
  return NextResponse.json({ companies })
}

// POST /api/admin/groups — 建立企業（僅 SUPER_ADMIN；自動產生邀請碼）
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  if (auth.role !== 'SUPER_ADMIN') return NextResponse.json({ error: '無權限' }, { status: 403 })

  const { name, description, taxId, address } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: '企業名稱必填' }, { status: 400 })
  if (!/^\d{8}$/.test(String(taxId ?? '').trim())) return NextResponse.json({ error: '統一編號需為 8 位數字' }, { status: 400 })
  if (!address?.trim()) return NextResponse.json({ error: '公司地址必填' }, { status: 400 })

  const company = await createCompany({
    name: name.trim(),
    description,
    taxId: String(taxId).trim(),
    address: String(address).trim(),
  })
  return NextResponse.json({ company }, { status: 201 })
}
