import { prisma } from '@/lib/db/prisma'
import { CommissionStatus, WithdrawalStatus, Prisma } from '@prisma/client'
import { safeDecrypt } from '@/lib/utils/crypto'

// 提領餘額計算（一個社群一份）：
//   raw = Σ(Commission.commissionAmount WHERE status=SETTLED, groupId)
//       − Σ(Withdrawal.amount           WHERE status IN APPROVED|PAID, groupId)
//       − Σ(Withdrawal.amount           WHERE status=PENDING, groupId)
//   available        = max(0, raw)
//   pendingAdjustment = max(0, -raw)   ← 退款已造成的「待扣抵」金額
//
// 為什麼這樣設計：
//   訂單退款時若該訂單 commission 已 SETTLED，cancelCommission 會把 status
//   改為 CANCELLED，settled 總額即下降。若該金額已撥款給社群主（在 paid 內），
//   raw 可能變負數。available 對外顯示 clamp 為 0，pendingAdjustment 揭露
//   需從未來 commission 扣回的金額。
export async function getWithdrawalBalance(
  groupId: string,
  client: Prisma.TransactionClient = prisma,
) {
  const [settledAgg, lockedAgg, paidAgg, pendingAgg] = await Promise.all([
    client.commission.aggregate({
      where: { groupId, status: CommissionStatus.SETTLED },
      _sum: { commissionAmount: true },
    }),
    client.withdrawal.aggregate({
      where: { groupId, status: { in: [WithdrawalStatus.APPROVED, WithdrawalStatus.PAID] } },
      _sum: { amount: true },
    }),
    client.withdrawal.aggregate({
      where: { groupId, status: WithdrawalStatus.PAID },
      _sum: { amount: true },
    }),
    client.withdrawal.aggregate({
      where: { groupId, status: WithdrawalStatus.PENDING },
      _sum: { amount: true },
    }),
  ])

  const settled  = settledAgg._sum.commissionAmount ?? 0
  const locked   = lockedAgg._sum.amount ?? 0       // APPROVED + PAID
  const paid     = paidAgg._sum.amount ?? 0
  const pending  = pendingAgg._sum.amount ?? 0
  const raw      = settled - locked - pending
  const available         = Math.max(0, raw)
  const pendingAdjustment = Math.max(0, -raw)        // 待扣抵金額（退款造成）

  return { settled, locked, paid, pending, available, pendingAdjustment }
}

// ─── 社群主：可提領的「整月」清單 ──────────────────────────────────
// 只能整月提領：列出已結算（CommissionSettlement，totalAmount>0）且尚未提領
// （無非 REJECTED 的 withdrawal 對應該 period）的月份。
export async function getWithdrawableMonths(groupId: string) {
  const [settlements, taken] = await Promise.all([
    prisma.commissionSettlement.findMany({
      where: { groupId, totalAmount: { gt: 0 } },
      select: { period: true, totalAmount: true },
      orderBy: { period: 'desc' },
    }),
    prisma.withdrawal.findMany({
      where: { groupId, period: { not: null }, status: { not: WithdrawalStatus.REJECTED } },
      select: { period: true },
    }),
  ])
  const takenSet = new Set(taken.map(w => w.period))
  return settlements
    .filter(s => !takenSet.has(s.period))
    .map(s => ({ period: s.period, amount: s.totalAmount }))
}

// ─── 社群主：申請提領（整月）──────────────────────────────────────

export type RequestWithdrawalResult =
  | { ok: true; withdrawalId: string }
  | { ok: false; reason: string }

// 只能整月提領：傳入結算月份 period（YYYY-MM），金額鎖定為該月結算總額。
export async function requestWithdrawalForPeriod(
  ownerId: string,
  period: string,
): Promise<RequestWithdrawalResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return { ok: false, reason: '月份格式錯誤' }
  }

  const group = await prisma.group.findUnique({
    where: { ownerId },
    select: {
      id: true, status: true,
      bankName: true, bankAccount: true, bankBranch: true, bankHolderName: true,
    },
  })

  if (!group)                              return { ok: false, reason: '無社群可提領' }
  if (group.status !== 'APPROVED')         return { ok: false, reason: '社群未核准' }
  if (!group.bankName || !group.bankAccount || !group.bankHolderName) {
    return { ok: false, reason: '請先到社群主後台補齊銀行資訊' }
  }

  // 在外層作用域先固定已驗證非空的銀行欄位（見下方 $transaction 閉包型別收斂說明）。
  const groupId        = group.id
  const bankName       = group.bankName
  const bankAccount    = group.bankAccount
  const bankBranch     = group.bankBranch
  const bankHolderName = group.bankHolderName

  // 檢查 + 建立在同一交易內，並以社群為粒度上交易級 advisory lock，避免同月並發雙重申請。
  const result = await prisma.$transaction<RequestWithdrawalResult>(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${groupId}))`

    const settlement = await tx.commissionSettlement.findUnique({
      where: { groupId_period: { groupId, period } },
      select: { totalAmount: true },
    })
    if (!settlement || settlement.totalAmount <= 0) {
      return { ok: false, reason: '該月份無可提領金額' }
    }
    // 同月份已申請（非 REJECTED）就擋掉 → 每月只能提領一次、整月。
    const existing = await tx.withdrawal.findFirst({
      where: { groupId, period, status: { not: WithdrawalStatus.REJECTED } },
      select: { id: true },
    })
    if (existing) return { ok: false, reason: '該月份已申請過提領' }

    const w = await tx.withdrawal.create({
      data: {
        groupId,
        amount: settlement.totalAmount,
        period,
        status: WithdrawalStatus.PENDING,
        bankInfoSnapshot: {
          bankName,
          bankAccount:    safeDecrypt(bankAccount),
          bankBranch:     bankBranch ? safeDecrypt(bankBranch) : '',
          bankHolderName: safeDecrypt(bankHolderName),
        } satisfies Prisma.InputJsonValue,
      },
    })

    return { ok: true, withdrawalId: w.id }
  })

  return result
}

// ─── Admin：審核 / 標記已撥款 / 拒絕 ─────────────────────────────

export async function approveWithdrawal(withdrawalId: string, note?: string) {
  return prisma.withdrawal.update({
    where: { id: withdrawalId, status: WithdrawalStatus.PENDING },
    data: { status: WithdrawalStatus.APPROVED, note: note ?? null },
  })
}

export async function rejectWithdrawal(withdrawalId: string, note?: string) {
  return prisma.withdrawal.update({
    where: { id: withdrawalId, status: WithdrawalStatus.PENDING },
    data: { status: WithdrawalStatus.REJECTED, processedAt: new Date(), note: note ?? null },
  })
}

export async function markWithdrawalPaid(withdrawalId: string, note?: string) {
  return prisma.withdrawal.update({
    where: { id: withdrawalId, status: WithdrawalStatus.APPROVED },
    data: { status: WithdrawalStatus.PAID, processedAt: new Date(), note: note ?? undefined },
  })
}

// ─── 查詢 ─────────────────────────────────────────────────────────

export async function getWithdrawalsByGroup(groupId: string) {
  return prisma.withdrawal.findMany({
    where: { groupId },
    orderBy: { appliedAt: 'desc' },
    select: {
      id: true, amount: true, period: true, status: true,
      appliedAt: true, processedAt: true, note: true,
    },
  })
}

export async function getAllWithdrawalsForAdmin(tenantAdminId?: string | null) {
  return prisma.withdrawal.findMany({
    where: tenantAdminId ? { group: { tenantAdminId } } : undefined,
    orderBy: [{ status: 'asc' }, { appliedAt: 'desc' }],
    include: {
      group: {
        select: {
          id: true, name: true,
          owner: { select: { displayName: true, lineUid: true } },
        },
      },
    },
  })
}
