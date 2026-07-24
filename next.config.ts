import type { NextConfig } from "next";

// 全站安全標頭。刻意保守——LIFF 跑在 LINE 的 webview 內，框限類的標頭下太重會
// 直接讓前台開不起來，所以分兩段套用。
//
// 未納入 Content-Security-Policy：本站要外部載入 TapPay SDK 與 LIFF SDK，
// CSP 設太緊會讓付款或登入整條掛掉，需要在實機逐一測過才敢上，另案處理。
const BASE_SECURITY_HEADERS = [
  // 強制 HTTPS，擋 SSL strip 與首次以 http 進站。
  // 不加 preload：那是送進瀏覽器內建清單的單向承諾，要另外申請且很難撤回。
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // 擋 MIME sniffing（例如把上傳內容當成 script 執行）
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 跨站只送 origin、不送完整路徑，避免訂單 id 之類的東西從 Referer 外流
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: BASE_SECURITY_HEADERS },
      {
        // 防點擊劫持只套後台。前台 /liff/* 不套：LIFF 由 LINE 的容器載入，
        // 下 DENY 有讓前台開不起來的風險；而後台才是真正值得保護、且只會用
        // 一般瀏覽器開的介面。
        source: '/platform/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
    ]
  },
};

export default nextConfig;
