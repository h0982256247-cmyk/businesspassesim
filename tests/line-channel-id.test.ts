import { describe, it, expect } from 'vitest'
import { channelIdFromLiffId } from '@/lib/auth/line'

// 登入驗證的 LINE Login channel ID 由後台 LIFF ID 拆出（{channelId}-{liffAppId}），
// 換 LINE 帳號只需改後台 LIFF ID、不必動 Vercel env。此測試鎖住拆解規則。
describe('channelIdFromLiffId — 從 LIFF ID 拆 LINE Login channel ID', () => {
  it('標準 LIFF ID 取前半 channel ID', () => {
    expect(channelIdFromLiffId('2010753530-4yyBqg0J')).toBe('2010753530')
  })

  it('null / undefined / 空字串 → undefined（讓呼叫端 fallback 到 env LINE_CHANNEL_ID）', () => {
    expect(channelIdFromLiffId(null)).toBeUndefined()
    expect(channelIdFromLiffId(undefined)).toBeUndefined()
    expect(channelIdFromLiffId('')).toBeUndefined()
  })

  it('無分隔符的異常格式 → 回整串（交由 LINE verify 端拒絕，不自行吞掉）', () => {
    expect(channelIdFromLiffId('2010753530')).toBe('2010753530')
  })
})
