import { prisma } from '@/lib/db/prisma'
import { CommissionStatus } from '@prisma/client'

// ─── 分潤計算（付款成功後呼叫）──────────────────────────────────

// 平台對每筆訂單抽 30% 作為「平台分配池」，這 30% 拆成：
//   user discount = rebateRate × subtotal    （由 GROUP_JOIN/REPURCHASE 券給用戶）
//   owner commission = (0.30 − rebateRate) × subtotal
//
// 用 subtotal（折扣前金額）而非 totalPaid 計算，這樣 OFFICIAL 券折扣不會影響社群主分潤
// （OFFICIAL 折扣由平台自行吸收）。
//
// 注意：rebateRate 取訂單發生時刻的 Group 設定值。社群主中途調整會影響後續訂單。
const PLATFORM_SHARE = 0.30

export async function calculateAndSaveCommission(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      subtotal: true,
      totalPaid: true,
      status: true,
      commission: { select: { id: true } },
      orderCoupons: {
        select: {
          coupon: {
            select: { sourceGroupId: true, isOfficial: true, type: true, discount: true },
          },
        },
      },
    },
  })

  if (!order) throw new Error(`Order ${orderId} not found`)
  if (order.commission) return // 冪等：已計算過就跳過

  // 找出所有「群組券」（有 sourceGroupId、非官方、非社群主7折）。官方券＝平台自行
  // 吸收折扣、不計分潤；社群主7折券亦不產生分潤。
  const groupCoupons = order.orderCoupons
    .map(oc => oc.coupon)
    .filter(c => c.sourceGroupId && !c.isOfficial && c.type !== 'GROUP_OWNER')

  if (groupCoupons.length === 0) return // 純官方券 / 社群主7折券 → 不產生分潤

  // 分潤歸屬：以第一張群組券的社群為準；只加總「同一社群」的群組券讓利
  // （使用者通常只屬於一個社群；跨社群的歷史券不混進此社群的分潤計算）。
  const sourceGroupId = groupCoupons[0].sourceGroupId!
  const sameGroupCoupons = groupCoupons.filter(c => c.sourceGroupId === sourceGroupId)

  const group = await prisma.group.findUnique({
    where: { id: sourceGroupId },
    select: { id: true, ownerId: true, status: true },
  })

  if (!group || group.status !== 'APPROVED') return

  // 讓利「加總」：多張群組券同時使用時，讓利率相加（例：兩張 9 折券 → 10%+10%=20%）。
  // 每張的讓利率由 coupon snapshot 推導：coupon.discount = 1 − rebateRate_at_issue。
  // 用 snapshot 而非 group 當下值，避免社群中途調整影響歷史訂單，三方金流恆一致。
  const effectiveRebateRate = sameGroupCoupons.reduce((s, c) => s + (1 - Number(c.discount)), 0)
  const ownerRate = PLATFORM_SHARE - effectiveRebateRate
  if (ownerRate <= 0) return                     // 讓利加總 ≥ 30% 時社群主沒分潤，不建立記錄
  const commissionAmount = Math.round(order.subtotal * ownerRate)
  if (commissionAmount <= 0) return

  // 冪等：用 findUnique + create 取代 upsert，規避 adapter-pg 的 upsert 異常回傳
  // rebateRate 欄位儲存「實際用於計算的值」（從 coupon snapshot 推導），而非 group.rebateRate 當下值
  const existing = await prisma.commission.findUnique({ where: { orderId } })
  if (!existing) {
    await prisma.commission.create({
      data: {
        orderId,
        groupId: group.id,
        groupOwnerId: group.ownerId,
        paidAmount: order.totalPaid,
        rebateRate: effectiveRebateRate,
        ownerRate,
        commissionAmount,
      },
    })
  }
  // 已存在 → 無需更新（原 upsert 的 update: {} 即此意）
}

// ─── 月結：產生結算單 ─────────────────────────────────────────────

export async function settleCommissions(groupId: string, period: string): Promise<void> {
  // period = "YYYY-MM"
  const [year, month] = period.split('-').map(Number)
  // 用 Asia/Taipei（UTC+8，無 DST）的月界，而非伺服器本機時區。
  // 先前用 new Date(year, month-1, 1) 會以執行環境時區計算：Vercel 跑 UTC 時，
  // 月初／月末 8 小時內付款（paidAt 以 UTC 儲存）的訂單會被歸到錯誤月份。
  // Date.UTC 取絕對時間，再減 8h 對齊台北 00:00，結果與伺服器時區無關。
  const TZ_OFFSET_MS = 8 * 60 * 60 * 1000
  const start = new Date(Date.UTC(year, month - 1, 1) - TZ_OFFSET_MS)
  const end = new Date(Date.UTC(year, month, 1) - TZ_OFFSET_MS)

  const commissions = await prisma.commission.findMany({
    where: {
      groupId,
      status: CommissionStatus.PENDING,
      order: { paidAt: { gte: start, lt: end } },
    },
    select: { id: true, commissionAmount: true },
  })

  if (commissions.length === 0) return

  const totalAmount = commissions.reduce((sum, c) => sum + c.commissionAmount, 0)
  const ids = commissions.map(c => c.id)

  await prisma.$transaction(async tx => {
    // 拆 upsert：@prisma/adapter-pg 與某些 upsert 模式不相容（會回傳空陣列）
    const existing = await tx.commissionSettlement.findUnique({
      where: { groupId_period: { groupId, period } },
    })
    const settlement = existing
      ? await tx.commissionSettlement.update({
          where: { groupId_period: { groupId, period } },
          data: { totalAmount: { increment: totalAmount } },
        })
      : await tx.commissionSettlement.create({
          data: { groupId, period, totalAmount },
        })

    await tx.commission.updateMany({
      where: { id: { in: ids } },
      data: { status: CommissionStatus.SETTLED, settlementId: settlement.id },
    })
  })
}

// ─── 查詢 ─────────────────────────────────────────────────────────

export async function getGroupCommissions(groupId: string) {
  return prisma.commission.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      paidAmount: true,
      rebateRate: true,
      ownerRate: true,
      commissionAmount: true,
      status: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          paidAt: true,
          subtotal: true,   // 分潤以原價(subtotal)計算，明細顯示用
          orderItems: { select: { productName: true } },
        },
      },
    },
  })
}

export async function getGroupSettlements(groupId: string) {
  return prisma.commissionSettlement.findMany({
    where: { groupId },
    orderBy: { period: 'desc' },
    select: {
      id: true,
      period: true,
      totalAmount: true,
      status: true,
      paidAt: true,
      note: true,
    },
  })
}

export async function getPendingBalance(groupId: string): Promise<number> {
  const result = await prisma.commission.aggregate({
    where: { groupId, status: CommissionStatus.PENDING },
    _sum: { commissionAmount: true },
  })
  return result._sum.commissionAmount ?? 0
}

// ─── 退款取消分潤 ─────────────────────────────────────────────────

// 同時處理 PENDING 與 SETTLED 兩種狀態：
//   PENDING  → 直接 CANCELLED，無副作用（還沒撥款）
//   SETTLED  → CANCELLED，社群主可提領餘額自然減少。若該 settled 金額已被
//              撥款給社群主（PAID withdrawal），會讓 available 變負數，
//              由 getWithdrawalBalance 在前端 clamp 顯示為 0，
//              並透露給社群主「待扣抵 NT$X」。等到新 commission 進來抵掉
//              即恢復正常（從下次提領自動扣回）。
export async function cancelCommission(orderId: string): Promise<{ cancelledPending: number; cancelledSettled: number }> {
  const [pending, settled] = await Promise.all([
    prisma.commission.updateMany({
      where: { orderId, status: CommissionStatus.PENDING },
      data: { status: CommissionStatus.CANCELLED },
    }),
    prisma.commission.updateMany({
      where: { orderId, status: CommissionStatus.SETTLED },
      data: { status: CommissionStatus.CANCELLED },
    }),
  ])
  return { cancelledPending: pending.count, cancelledSettled: settled.count }
}

// ─── Admin：所有待結算分潤 ────────────────────────────────────────

export async function getAllPendingCommissions(tenantAdminId?: string | null) {
  return prisma.commission.findMany({
    where: {
      status: CommissionStatus.PENDING,
      ...(tenantAdminId ? { group: { tenantAdminId } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      group: { select: { name: true } },
      order: { select: { paidAt: true } },
    },
  })
}
