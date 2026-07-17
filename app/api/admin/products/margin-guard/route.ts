import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAuth } from '@/lib/auth/platform'
import { prisma } from '@/lib/db/prisma'

// 毛利保護（per-tenant）：開關 + 門檻% + 一鍵把毛利低於門檻的商品售價補到門檻。
// 「毛利低於門檻」＝ (售價−成本)/售價 < rate ⟺ 成本 > 售價×(1−rate)。
// 補價後售價 = ⌈成本 ÷ (1−rate)⌉（剛好達門檻毛利）。

interface Sample { country: string; days: number; cap: string | null; sell: number; cost: number; newSell: number }

async function belowThreshold(tid: string, rate: number): Promise<{ belowCount: number; samples: Sample[] }> {
  if (!(rate > 0 && rate < 1)) return { belowCount: 0, samples: [] }
  const samples = await prisma.$queryRaw<Sample[]>`
    SELECT country_name_zh AS country, display_days AS days, data_capacity AS cap,
           sell_price AS sell, cost_price AS cost,
           CEIL(cost_price::numeric / (1 - ${rate}::numeric))::int AS "newSell"
    FROM products
    WHERE tenant_admin_id = ${tid} AND status::text = 'ACTIVE'
      AND cost_price::numeric > sell_price * (1 - ${rate}::numeric)
    ORDER BY (cost_price::numeric / NULLIF(sell_price, 0)) DESC
    LIMIT 5
  `
  const cnt = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM products
    WHERE tenant_admin_id = ${tid} AND status::text = 'ACTIVE'
      AND cost_price::numeric > sell_price * (1 - ${rate}::numeric)
  `
  return { belowCount: Number(cnt[0]?.n ?? 0), samples }
}

// GET：目前設定 + 低於門檻筆數/範例
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  const tid = auth.tenantAdminId
  if (!tid) return NextResponse.json({ enabled: false, rate: 40, belowCount: 0, samples: [] })

  const a = await prisma.platformAdmin.findUnique({
    where: { id: tid },
    select: { marginGuardEnabled: true, minMarginRate: true },
  })
  const rate = Number(a?.minMarginRate ?? 0.4)
  const { belowCount, samples } = await belowThreshold(tid, rate)
  return NextResponse.json({ enabled: a?.marginGuardEnabled ?? false, rate: Math.round(rate * 100), belowCount, samples })
}

// PATCH：更新開關 / 門檻%
export async function PATCH(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  const tid = auth.tenantAdminId
  if (!tid) return NextResponse.json({ error: '請在特定白牌後台操作' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { enabled?: boolean; rate?: number }
  const data: { marginGuardEnabled?: boolean; minMarginRate?: number } = {}
  if (typeof body.enabled === 'boolean') data.marginGuardEnabled = body.enabled
  if (typeof body.rate === 'number' && Number.isFinite(body.rate)) {
    data.minMarginRate = Math.min(95, Math.max(1, Math.round(body.rate))) / 100   // 夾在 1~95%
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: '無可更新欄位' }, { status: 400 })

  const a = await prisma.platformAdmin.update({
    where: { id: tid }, data,
    select: { marginGuardEnabled: true, minMarginRate: true },
  })
  const rate = Number(a.minMarginRate)
  const { belowCount, samples } = await belowThreshold(tid, rate)
  return NextResponse.json({ enabled: a.marginGuardEnabled, rate: Math.round(rate * 100), belowCount, samples })
}

// POST：一鍵補價（單句 UPDATE，僅毛利低於門檻者）
export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req)
  if (auth instanceof NextResponse) return auth
  const tid = auth.tenantAdminId
  if (!tid) return NextResponse.json({ error: '請在特定白牌後台操作' }, { status: 400 })

  const a = await prisma.platformAdmin.findUnique({
    where: { id: tid }, select: { marginGuardEnabled: true, minMarginRate: true },
  })
  if (!a?.marginGuardEnabled) return NextResponse.json({ error: '請先開啟毛利保護' }, { status: 400 })
  const rate = Number(a.minMarginRate)
  if (!(rate > 0 && rate < 1)) return NextResponse.json({ error: '門檻設定不正確' }, { status: 400 })

  const raised = await prisma.$executeRaw`
    UPDATE products SET sell_price = CEIL(cost_price::numeric / (1 - ${rate}::numeric))::int, updated_at = NOW()
    WHERE tenant_admin_id = ${tid} AND status::text = 'ACTIVE'
      AND cost_price::numeric > sell_price * (1 - ${rate}::numeric)
  `
  return NextResponse.json({ raised, rate: Math.round(rate * 100) })
}
