import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PlatformDashboard from '@/app/platform/page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

const stats = {
  role: 'SUPER_ADMIN',
  totalUsers: 14, totalOrders: 11, totalRevenue: 200, pendingMembers: 0,
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
  eligibleRevenue: 200, totalCost: 133, grossProfit: 67, marginRate: 0.335,
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
  it('營收／毛利／成本三張卡各自顯示當月・上月・上上月與較上月百分比', async () => {
    render(<PlatformDashboard />)
    await waitFor(() => expect(screen.getAllByText('當月 · 9月')).toHaveLength(3))
    expect(screen.getAllByText('上月 · 8月')).toHaveLength(3)
    expect(screen.getAllByText('上上月 · 7月')).toHaveLength(3)

    // 營收：9月 50 / 8月 200 / 7月 900
    expect(screen.getByText('NT$50')).toBeTruthy()
    expect(screen.getByText('NT$900')).toBeTruthy()
    // 毛利：9月 -30（負值顯示 -NT$30）
    expect(screen.getByText('-NT$30')).toBeTruthy()
    // 成本：9月 80 / 8月 133 / 7月 400
    expect(screen.getByText('NT$80')).toBeTruthy()
    expect(screen.getByText('NT$400')).toBeTruthy()

    // 較上月百分比：營收 50 vs 200 → -75%；毛利 -30 vs 67 → -145%；成本 80 vs 133 → -40%
    expect(screen.getByText(/較上月\s*↓\s*75%/)).toBeTruthy()
    expect(screen.getByText(/較上月\s*↓\s*145%/)).toBeTruthy()
    expect(screen.getByText(/較上月\s*↓\s*40%/)).toBeTruthy()
  })
})
