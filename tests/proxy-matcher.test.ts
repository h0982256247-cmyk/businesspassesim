import { describe, it, expect } from 'vitest'
import { config } from '@/proxy'

// 回歸鎖：proxy 的 matcher 決定「哪些請求會進認證閘門」。原本只有一條萬用規則，
// 它排除靜態資源的 `.*\.(?:svg|…|js)` 未錨定結尾，導致帶副檔名的 API 路徑
// （/api/orders/<id>.js，仍會命中 [id] 動態路由）整個跳過閘門。
// 現在 /api/* 獨立一條，任何 API 路徑都必進閘門。

// path-to-regexp 的 '/api/:path*'：/api 之下任意層級（含帶點的片段）
const apiMatcher = /^\/api(?:\/.*)?$/
// 萬用規則（副檔名已用 $ 錨定）
const catchAll = new RegExp(
  '^/((?!_next/|liff/|platform/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)$',
)
const runsProxy = (p: string) => apiMatcher.test(p) || catchAll.test(p)

describe('proxy matcher — API 一律進認證閘門', () => {
  it('config 有把 /api/* 獨立列一條（別被合併回單一萬用規則）', () => {
    expect(config.matcher).toContain('/api/:path*')
  })

  it('一般 API 路徑進閘門', () => {
    expect(runsProxy('/api/orders')).toBe(true)
    expect(runsProxy('/api/orders/ckxyz123')).toBe(true)
    expect(runsProxy('/api/platform/users/abc')).toBe(true)
  })

  it('帶靜態副檔名的 API 路徑仍進閘門（原本的繞過手法）', () => {
    expect(runsProxy('/api/orders/abc123.js')).toBe(true)
    expect(runsProxy('/api/platform/users/xyz.css')).toBe(true)
    expect(runsProxy('/api/gift/TOKEN.png')).toBe(true)
    expect(runsProxy('/api/admin/products/x.svg')).toBe(true)
  })

  it('非 API 的真靜態資源仍被排除（不讓 proxy 擋住 CSS/JS/圖片）', () => {
    expect(runsProxy('/logo.png')).toBe(false)
    expect(runsProxy('/assets/app.js')).toBe(false)
    expect(runsProxy('/_next/static/chunk.js')).toBe(false)
  })

  it('副檔名以 $ 錨定：路徑中間帶 .js 的頁面路徑不被誤排除', () => {
    expect(runsProxy('/a.js/b')).toBe(true)
  })
})
