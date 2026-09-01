import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PlatformDashboard from '@/app/platform/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const stats = {
  role: 'SUPER_ADMIN',
  totalUsers: 14, totalOrders: 11, totalRevenue: 1150, pendingMembers: 0,
  totalCompanies: 3, totalProducts: 5, paymentConfigured: true, esimPendingOrders: 0,
  monthlyRevenue: [
    { month: '4月', revenue: 0, cost: 0, grossProfit: 0 },
    { month: '5月', revenue: 0, cost: 0, grossProfit: 0 },
    { month: '6月', revenue: 0, cost: 0, grossProfit: 0 },
    { month: '7月', revenue: 900, cost: 400, grossProfit: 500 },
    { month: '8月', revenue: 200, cost: 133, grossProfit: 67 },
    { month: '9月', revenue: 50, cost: 80, grossProfit: -30 },
  ],
  recentOrders: [],
  // 累計值＝近三月合計（1150 / 613 / 537），用來驗證主數字已不是累計
  eligibleRevenue: 1150, totalCost: 613, grossProfit: 537, marginRate: 0.467,
  ordersIncluded: 3, ordersExcluded: 0,
  riskAlerts: {
    systemAlerts: { count: 0, examples: [] },
    lossOrders: { count: 0, examples: [] },
    benefitOverSell: { count: 0, examples: [] },
  },
}

beforeEach(() => {
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(String(url).includes('auth/me') ? { admin: { name: 'Super Admin' } } : stats),
    })
  ) as unknown as typeof fetch
})

describe('儀表板近三個月拆分', () => {
  it('三張卡以當月值當主數字，並各自顯示近三個月月份與較上月百分比', async () => {
    render(<PlatformDashboard />)
    // 每個月份出現 4 次：三張卡的拆分格 + 趨勢圖 X 軸
    await waitFor(() => expect(screen.getAllByText('9月')).toHaveLength(4))
    expect(screen.getAllByText('8月')).toHaveLength(4)
    expect(screen.getAllByText('7月')).toHaveLength(4)
    // 不再出現「當月／上月／上上月」字樣
    expect(screen.queryByText(/當月|上上月/)).toBeNull()

    // 主數字＝當月（不是累計）：營收 50、毛利 -30、成本 80 各出現 2 次（主數字 + 當月拆分格）
    expect(screen.getAllByText('NT$50')).toHaveLength(2)
    expect(screen.getAllByText('-NT$30')).toHaveLength(2)
    expect(screen.getAllByText('NT$80')).toHaveLength(2)
    // 累計值（營收 1,150 / 毛利 537 / 成本 613）整頁都不再出現
    expect(screen.queryByText('NT$1,150')).toBeNull()
    expect(screen.queryByText('NT$537')).toBeNull()
    expect(screen.queryByText('NT$613')).toBeNull()
    // 上月／上上月拆分
    expect(screen.getByText('NT$200')).toBeTruthy()
    expect(screen.getByText('NT$900')).toBeTruthy()
    expect(screen.getByText('NT$133')).toBeTruthy()
    expect(screen.getByText('NT$400')).toBeTruthy()

    // 較上月百分比：營收 50 vs 200 → -75%；毛利 -30 vs 67 → -145%；成本 80 vs 133 → -40%
    expect(screen.getByText(/較上月\s*↓\s*75%/)).toBeTruthy()
    expect(screen.getByText(/較上月\s*↓\s*145%/)).toBeTruthy()
    expect(screen.getByText(/較上月\s*↓\s*40%/)).toBeTruthy()
  })
})
