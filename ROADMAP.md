# Bee 旅白牌系統｜架構強化 Roadmap（技術債與目標）

> 定位：這份**不是**每日開發守則（那是 `CLAUDE.md`）。這裡放的是「**要先蓋基礎設施才能遵守**」的目標。
> 判準：一條規則若現在的程式碼能直接遵守 → 進 `CLAUDE.md`；若要先建表／建機制才談得上 → 放這裡。
> 原則：每一項都要**單獨排期、單獨評估 migration 風險**，不可為了「達標」去大改正在運作的金流（見 `CLAUDE.md` J 段）。
>
> 內容依據 2026-06 對現有程式碼的查證，分 P0–P3。**先做風險/回報比最高的，不照理想架構順序。**

---

## 現況基準（已有的、別重蓋）

蓋新東西前先認清你**已經有**的，避免重複造輪子：

- **冪等守門**：`markOrderProcessing` 條件鎖、coupon `count===1`、gift `claimedAt IS NULL`、`Commission.orderId` unique、WM webhook `activatedAt` 冪等。
- **發卡 retry**：`cron/retry-esim-activation` + `Order.retryCount` / `lastRetryAt`（基本款，缺精細排程，見 P3-b）。
- **告警**：`lib/utils/fire-and-log.ts` + `lib/services/alert.ts` + `system_alerts` 後台紅字。
- **退款回沖**：`restoreCouponsForRefundedOrders`（券）、`cancelCommission`（分潤）。
- **cron 安全**：4 支 cron 全 `CRON_SECRET` fail-closed。
- **財務可追溯**：`Order` 金額皆 `Int`（台幣，無浮點問題）、`tapPayRecTradeId` / `wmOrderId` 皆 unique。
- **第三方入口驗證**：TapPay→Record API 回查；WM webhook→`wmOrderId+rcode` 雙比對；cron→`CRON_SECRET`。

---

## P0 — 消除關鍵路徑的靜默吞錯 ✅ 已完成（2026-06）

**結論**：關鍵交付 side effect 其實**早已修好**——`triggerEsimActivation`／`calculateAndSaveCommission`／
`issueRepurchaseCouponForOrder` 在 notify route 內已是 `await` + `recordAlert`（開卡更特意 await 在回 200 前，
避免 Vercel serverless 凍結背景工作）。原先擔心的「付款成功卻沒發卡、無痕跡」致命情形並不存在。

**本輪處理**：唯一殘留的靜默吞錯是 `notifyOrderPaid`（LINE 付款成功推播，非交付關鍵）的兩處 `.catch(()=>{})`，
已改用 `fireAndLog` → 失敗寫 `system_alerts`、仍非阻塞。notify route 內錯誤處理現已 100% 一致；
`CLAUDE.md` F 段過時描述同步修正。

**其餘 `.catch(()=>{})`**（共 26 處）多為前端 UI fire-and-forget，可接受；長期隨 P3-d（structured logger）一併收斂。

---

## P1 — 補最致命的流程測試（目前流程測試 0 個）

**現況**：`tests/` 有 14 個檔，**全是純函式/utils**（esim-status、coupon-rules、tappay-3ds-body…）。
下單、付款 webhook、發卡、跨租戶**沒有任何**端到端測試。

**目標**：先補 3 條「出錯就是真金白銀」的，不求一次補完整個矩陣。

1. **TapPay notify 重送 → 不重複發卡**（驗 `markOrderProcessing` 條件鎖）。
2. **已退款訂單 → 不可再發卡**（驗 `order.ts` REFUNDED 守門）。
3. **A 租戶不可讀 B 租戶訂單**（驗 by-id 查詢帶 `tenantAdminId`，呼應 getProductById 前車之鑑）。

**後續**（P1.5，行有餘力）：WM webhook 冪等（`activatedAt` 重送）、coupon 跨租戶使用、gift 重複領取。
**風險**：低（新增測試，不動 production code）。
**驗收**：3 條測試綠燈並納入 CI。

---

## P2 — 租戶隔離：漸進式強化（不要一次重寫） ✅ 完成

**現況**：無 DB RLS，靠每個 query 手動帶 `tenantAdminId`。memory 記載 `getProductById` 曾漏致跨白牌下單（已修）——
代表「靠工程師記得加 where」確實出過事。

**目標**：讓「忘記加 tenant filter 就拿不到資料」，而非靠紀律。但**全面導入 `createTenantDb` = 大重構，禁止一次到位**。

**做法（折衷、可回滾）**：先只替最高風險的 **Order / Coupon / Commission** 包一層 tenant-scoped helper，
新程式優先用、舊程式漸進遷移。grep 出所有 by-id 查詢逐一確認帶了 tenant 條件。

**風險**：中（動到資料存取層）。每遷一處都要 `tsc` + 對應流程驗證。
**驗收**：高風險表的單筆查詢都經過 helper；P1 的跨租戶測試持續綠燈。

**進度（2026-06）**：
- ✅ **Order**：LIFF 端 `getOrderForOwner`（fail-closed，owner 進 where；redeem/usage 已遷移）＋ platform 端
  `orderTenantWhere`（收斂 4 處後台查詢）。補 `getProductById` / `getOrderForOwner` / `orderTenantWhere` 回歸測試。
  順帶修掉 usage 用 `userId` 致「接收者查不到轉贈訂單流量」的既有 bug。
- ✅ **Coupon / Commission**：探查後確認**無散落的 tenant where 可收斂**——Coupon 無 tenant-scoped 查詢
  （綁 user/order）；Commission 的租戶過濾走 group relation，只 `getAllPendingCommissions` 一處，抽 helper
  屬過度工程。改以**補隔離測試**鎖住不變量（白牌 admin 只看自己租戶的待結算分潤，呼應 I 段「跨群不可歸屬」）。

---

## P3 — 架構升級（長期目標，逐項獨立排期 + 評估 migration）

依差距大小與痛感排序：

### P3-a　財務帳本 FinancialLedger / PaymentTransaction（差距最大）
**現況**：金額快照在 `Order`（`subtotal`/`discountAmount`/`totalPaid`/`taxAmount`），但**無獨立不可變帳本**，
也缺 `supplierCost`/`paymentProviderFee`/`refundAmount`/`commissionAmount` 等快照欄位。
**痛點**：一旦有退款/對帳爭議，無法「只增不改」地追溯每筆金流。
**目標**：新增 append-only 帳本，退款/沖銷/調整一律新增紀錄，不改舊數字。
**注意**：屬付款相關 migration → 需 rollback 方案 + 部署後驗證（J 段）。先設計 schema 討論，不急著上。

### P3-b　Retry 強化為 outbox 模型（已有基礎，補精細度）
**現況**：`retry-esim-activation` cron + `Order.retryCount` 已能重試，但無 `nextRetryAt`/`maxRetry`/退避節奏，
失敗到頂也無明確 `NEEDS_MANUAL_REVIEW` 狀態。
**目標**：獨立 outbox/task 表（task type、orderId、tenantId、retryCount、maxRetry、lastError、nextRetryAt、status），
退避 1m→5m→15m→1h→人工。**這是「強化現有」，非從零建。**

### P3-c　Reconciliation 對帳 cron（目前完全沒有）
**現況**：cron 只有 cancel-pending / cancel-expired-gifts / retry-esim / settle-monthly，**無對帳**。
**目標**：每日對帳：已付款未發卡 > 10 分鐘、已發卡未完成、WM 已回傳但 DB 無紀錄、已退款卻仍有待發卡 task、
已付款未建 commission/coupon、cron 是否停擺。產出 → `system_alerts`。

### P3-d　Structured logger + traceId（目前是 console.log）
**目標**：分級 logger，每筆帶 `traceId/tenantId/orderId/action/status/errorCode`；
付款/eSIM 補 `providerTransactionId/wmOrderId/retryCount`。逐步取代 console.log（呼應 F 段）。

### P3-e　集中訂單狀態機 transitionOrderStatus（優先級最低）
**現況**：直接改 status 僅 **2 處**，散落問題其實很小，**現在不值得為它建整套狀態機**。
**目標**：未來狀態轉換變多時再導入，定義允許的前後狀態、來源、是否可重試/可人工覆寫/影響退款回沖。

---

## 不在此 Roadmap（已達標，別當問題處理）
- 金額整數最小單位 ✅（`Int`）
- provider transaction ID 可追溯 ✅（`tapPayRecTradeId` / `wmOrderId` unique）
- 核心冪等守門 ✅
- cron fail-closed ✅
- 退款回沖單一來源 ✅
