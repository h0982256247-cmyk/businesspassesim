import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { PlatformAdminRole } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

type Params = { params: Promise<{ id: string }> }

// 權限：SUPER_ADMIN 或本人 / 其下線（與帳號 PATCH 同一套租戶隔離）
async function authorize(req: NextRequest, id: string) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return { error: auth }
  if (auth.role !== PlatformAdminRole.SUPER_ADMIN) {
    const target = await prisma.platformAdmin.findUnique({ where: { id }, select: { parentId: true } })
    if (!target) return { error: NextResponse.json({ error: '帳號不存在' }, { status: 404 }) }
    if (id !== auth.adminId && target.parentId !== auth.adminId) {
      return { error: NextResponse.json({ error: '無權操作此帳號' }, { status: 403 }) }
    }
  }
  return { auth }
}

// 純 host 驗證：小寫、不含協定/路徑/空白，至少一個點，合法網域字元。
function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim()
  if (!d || d.length > 253) return null
  if (!/^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(d)) return null
  if (d.endsWith('.vercel.app')) return null // 不可綁平台預設網域
  return d
}

// GET — 列出該租戶的自訂網域
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const a = await authorize(req, id)
  if (a.error) return a.error
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantAdminId: id },
    select: { id: true, domain: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ domains })
}

// POST { domain } — 新增自訂網域
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const a = await authorize(req, id)
  if (a.error) return a.error

  const body = await req.json().catch(() => ({}))
  const domain = normalizeDomain(body?.domain)
  if (!domain) return NextResponse.json({ error: '網域格式不正確（請填純網域，如 esim.example.com）' }, { status: 400 })

  const existing = await prisma.tenantDomain.findUnique({ where: { domain }, select: { tenantAdminId: true } })
  if (existing) {
    return NextResponse.json(
      { error: existing.tenantAdminId === id ? '此網域已綁定' : '此網域已被其他商店綁定' },
      { status: 409 },
    )
  }

  await prisma.tenantDomain.create({ data: { tenantAdminId: id, domain } })
  return NextResponse.json({ ok: true })
}

// DELETE ?domain=... — 移除自訂網域
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const a = await authorize(req, id)
  if (a.error) return a.error

  const domain = normalizeDomain(req.nextUrl.searchParams.get('domain'))
  if (!domain) return NextResponse.json({ error: '網域格式不正確' }, { status: 400 })

  // 只能刪自己租戶的網域
  await prisma.tenantDomain.deleteMany({ where: { tenantAdminId: id, domain } })
  return NextResponse.json({ ok: true })
}
