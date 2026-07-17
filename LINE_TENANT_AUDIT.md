# 多租戶 LINE / 金流 / eSIM 設定稽核報告

> 目標：每個白牌 tenant 用自己獨立的 LINE Console、金流、eSIM 供應商設定，並清掉 Vercel 沒用到的變數。
> 本報告基於對 live 程式（根目錄 `app/`、`lib/`、`components/`，**不含死碼 `app-src/`**）的實際逐檔稽核。

---

## 0. 先更正幾個前提（你信中的假設與現況不同）

| 你的假設 | 實際現況 | 結論 |
|---|---|---|
| 前端寫死全域 `NEXT_PUBLIC_LIFF_ID` | 前台 `liff.init()` 用的是**各租戶 DB 的 `PlatformAdmin.liffId`**（`app/liff/[slug]/layout.tsx` → `getTenantBySlug`）。`NEXT_PUBLIC_LIFF_ID` 只在「後台設定頁顯示 LIFF URL」用到。 | 已是 per-tenant，**不需重做** |
| 有 server-side LINE Login OAuth callback 要改 | 本專案是**純 LIFF 前端登入**：`liff.getIDToken()` → POST `/api/auth/line` 後端用 `verify` 端點驗 id token。**沒有 /authorize、/callback、沒有用 state 換 token**。 | 你信中的「第 5 點 callback 改造」**不適用**；LIFF 已內建這套 |
| id token 驗證用全域 channel | 後端用**該租戶 liffId 前綴解析 channelId**（`tenant.liffId.split('-')[0]`）去驗，env 只是 fallback。 | 已是 per-tenant |
| 金流是全平台共用 | TapPay 走 **per-tenant `TenantPaymentConfig`**（partnerKey/appKey 已加密），eSIM 走 **per-tenant `TenantEsimConfig`**（token 已加密）。 | 已是白牌設定 |
| LINE 推播 token 可能沒加密 | `PlatformAdmin.lineAccessToken` **寫入時 `encrypt`、讀取 `safeDecrypt`、後台只回遮罩**。 | 加密已完成 |

**真正的問題不在「沒有多租戶」，而在以下幾個破口 ↓**

---

## 1. 目前專案有哪些問題

### 🔴 P0-A：付款/發卡/轉贈的 LINE 推播沒帶租戶 → 實際上「完全沒推播」
`notifyOrderPaid / notifyEsimReady / notifyEsimPending / notifyGiftClaimed` 呼叫時沒帶 `tenantAdminId`，
而 `getLineToken(undefined)` 會退回全域 `process.env.LINE_CHANNEL_ACCESS_TOKEN`——但**該變數在 Vercel 根本沒設**，
所以 `token=''` → `sendLineMessage` 直接 return。結果：**付款成功、eSIM 就緒、轉贈被領取這幾種通知，目前一封都沒送出。**
（社群審核通知 `notifyGroupApproved/Rejected` 有正確帶租戶，是好的對照。）
→ **已修，見第 6 節。**

### 🟠 P0-B：session 簽章金鑰與 LINE Login Channel Secret 混用
`lib/auth/session.ts` 原本用 `LINE_CHANNEL_SECRET` 簽網站登入 cookie。語意上應該是「網站自己的」金鑰，
和 LINE Login Channel Secret 無關，混用會造成：白牌換 LINE Login channel / rotate secret 時，全站使用者 session 失效。
→ **已修：改用 `SESSION_SECRET ?? LINE_CHANNEL_SECRET`（向後相容），見第 6 節。**

### 🟠 P1-A：User 全域唯一 `lineUid @unique`，非 `(tenantAdminId, lineUid)` 複合唯一
`prisma/schema.prisma` 的 `User.lineUid @unique` 是**全平台唯一**。同一個人在 A、B 兩個白牌各自登入時，
只會有一筆 User、綁在「第一個登入的租戶」。實務上因為**每個白牌有各自的 LINE Login channel → 同一人的 `sub` 通常不同**，
碰撞機率低；但若兩個白牌共用同一個 LINE Provider，`sub` 會相同 → 同一筆 User 跨租戶、購物車/券/訂單歸屬錯亂。
→ **建議改複合唯一（需 migration，有風險，待你確認，見第 5 節）。**

### 🟡 P1-B：全域 fallback 仍在（金流/eSIM/LINE）
`tappay.ts`、`esim.ts`、`notification.ts`、`line.ts` 都還有 `process.env.*` 全域 fallback。
好消息：這些「危險的全域帳號」**在 Vercel 都沒設值**，所以正式環境其實已只走 per-tenant。
風險點：若哪天有人在 Vercel 補了全域 TapPay/WM 金鑰，設定漏掉的租戶會「靜默用平台的帳號收款/發卡」而不是明確報錯。
→ **建議：上線前把這些全域 fallback 改成「找不到租戶設定就明確報錯」，而非偷偷用 env（待確認）。**

### 🟡 P2-A：沒有自訂網域（custom domain）解析
目前 tenant 只能用 slug（`/liff/<slug>`）解析，沒有 `TenantDomain` model、不支援 `esim.客戶.com` 這種 hostname。
→ 非上線必要（slug 可用），列 P2。

### 🟡 P2-B：後台 LINE 設定散落、欄位沒分「Login / Messaging」、無測試鈕
LINE 設定目前混在「帳號管理」編輯頁（只有 `liffId`、`lineAccessToken` 兩欄）。
→ 建議獨立「LINE 設定」頁、分兩區、加「測 LIFF / 測推播 token」按鈕（P2）。

### ℹ️ 沒有 LINE webhook 接收端
全專案**沒有**接收 LINE 使用者訊息的 webhook，也就沒有用到 `messagingChannelSecret` 驗簽。
→ 因此你信中「為每租戶存 messagingChannelSecret」目前**用不到**；等真的要做 Rich Menu / 客服訊息接收再加。

---

## 2. Vercel 環境變數盤點與「可移除」建議

Vercel 目前有 12 個變數，**逐一比對程式——沒有任何一個是「程式完全沒引用」的死變數**。
但有幾個是「per-tenant 化之後變多餘的全域值」：

| 變數 | 程式有用？ | 建議 |
|---|---|---|
| `DATABASE_URL` `DIRECT_URL` `FIELD_ENCRYPTION_KEY` `PLATFORM_JWT_SECRET` `CRON_SECRET` `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` | ✅ 平台級必要 | **保留** |
| `TAPPAY_ENV` | 只當 fallback | 保留（無害）或上線後移除 |
| `ESIM_SUPPLIER_API_URL` | 只當 fallback | 保留（WM 主機 URL 不敏感） |
| `LINE_CHANNEL_ID` | id token 驗證 fallback | 保留（單租戶相容） |
| `LINE_CHANNEL_SECRET` | 現在只當 `SESSION_SECRET` 的相容 fallback | **改：新增 `SESSION_SECRET`（值沿用原本這個），之後可刪此變數** |
| `NEXT_PUBLIC_LIFF_ID` | 只餵「後台設定頁顯示 URL」 | **可移除**（待後台頁改成顯示各租戶 liffId 後） |

> 結論：**沒有完全沒用到的變數可以無腦刪**。唯一「真的多餘」是 `NEXT_PUBLIC_LIFF_ID`（且要先改後台顯示邏輯）。
> 另外建議**新增 `SESSION_SECRET`**（值＝目前的 `LINE_CHANNEL_SECRET`），讓 session 與 LINE 解耦。
> 刪 Vercel 變數會動到正式設定，**我先列清單、等你點頭再實際刪**。

---

## 3. Prisma schema / migration 建議

### 現況（已存在，不用新增）
- `PlatformAdmin.liffId`、`PlatformAdmin.lineAccessToken`（加密）
- `TenantPaymentConfig`（partnerKey/appKey 加密、`@@unique([adminId, gateway])`）
- `TenantEsimConfig`（token 加密、`adminId @unique`）

### 建議調整
1. **（P1，需確認）** `User` 改複合唯一：
   ```prisma
   // 移除 lineUid 的 @unique，改：
   @@unique([tenantAdminId, lineUid])
   ```
   ⚠ 風險：需 data migration（現有 `tenantAdminId=null` 的列要先回填）；且改完後「同一人在第二個白牌登入」會**新建第二筆 User**（購物車/券/訂單各自獨立）——這才是白牌正確語意，但要確認你接受。

2. **（P2，等要做 webhook / OAuth 再加）** 才需要把 LINE 設定抽成獨立 `TenantLineConfig`（含 `loginChannelSecretEnc`、`messagingChannelSecretEnc`）。**現在不建議新增**——目前驗 id token 只需 channelId（已從 liffId 解析）、推播只需 access token（已存 `PlatformAdmin`），多開一張表沒有實質好處還增加遷移風險。

---

## 4. API / service / frontend 要改的檔案

| 層 | 檔案 | 改什麼 | 狀態 |
|---|---|---|---|
| service | `lib/services/notification.ts` | 4+2 個 notify 捷徑補 `tenantAdminId` 參數 | ✅ 已改 |
| route | `app/api/payment/tappay/route.ts` | 2 處 `notifyOrderPaid` 帶 `user.tenantAdminId` | ✅ 已改 |
| route | `app/api/payment/tappay/notify/route.ts` | 2 處 `notifyOrderPaid` 帶 `tenantAdminId` | ✅ 已改 |
| route | `app/api/webhooks/wm/esim-redeemed/route.ts` | 查詢補 user 租戶、`notifyEsimReady` 帶租戶 | ✅ 已改 |
| service | `lib/services/esim.ts` | `notifyEsimPending` 帶 `tenantAdminId` | ✅ 已改 |
| service | `lib/services/gift.ts` | `notifyGiftClaimed` 帶 sender 租戶 | ✅ 已改 |
| auth | `lib/auth/session.ts` | 改用 `SESSION_SECRET ?? LINE_CHANNEL_SECRET` | ✅ 已改 |
| docs | `.env.example` | 補 `SESSION_SECRET`、`TAPPAY_LINEPAY_MERCHANT_ID`、註明 per-tenant | ✅ 已改 |
| frontend/back | `app/platform/liff/page.tsx` | 後台顯示「各租戶 liffId」而非 `NEXT_PUBLIC_LIFF_ID`（為移除該 env 鋪路） | ⏳ 待做(P2) |
| route/service | `tappay.ts` / `esim.ts` | 全域 fallback 改「無租戶設定就報錯」 | ⏳ 待確認(P1) |
| schema | `prisma/schema.prisma` | `User` 複合唯一 + migration | ⏳ 待確認(P1) |
| 新功能 | tenant resolver + `TenantDomain` | 支援自訂網域 | ⏳ P2 |
| 後台 UI | 新「LINE 設定」頁（分區 + 測試鈕） | UX | ⏳ P2 |

---

## 5. 建議實作順序

### P0（已完成、本次直接修）
1. ✅ 多租戶 LINE 推播串接（修好「目前完全沒推播」）
2. ✅ `SESSION_SECRET` 與 LINE 解耦（向後相容）

### P1（白牌營運必要，**有風險、待你點頭**）
3. `User` 改 `(tenantAdminId, lineUid)` 複合唯一 + 回填 migration
4. 金流/eSIM 全域 fallback 改成「缺租戶設定就明確報錯」（避免誤用平台帳號收款）
5. Vercel：新增 `SESSION_SECRET`（值＝原 `LINE_CHANNEL_SECRET`）；改完後台後移除 `NEXT_PUBLIC_LIFF_ID`

### P2（後續優化）
6. 自訂網域解析（`TenantDomain` + `resolveTenantFromHost`）
7. 後台「LINE 設定」獨立頁：分「Login/LIFF」與「Messaging API」兩區、加測試鈕、Messaging Channel ID 不列必填
8. 真要做 LINE webhook（Rich Menu / 客服）時，才加 `TenantLineConfig.messagingChannelSecretEnc` + 驗簽

---

## 6. 本次已直接修改（P0，TypeScript / build 通過）

- **多租戶 LINE 推播**：`notification.ts` 的 `notifyOrderPaid/EsimReady/EsimPending/GiftClaimed/CouponIssued/CommissionSettled` 全部支援 `tenantAdminId`；6 個呼叫點（tappay 同步、tappay notify webhook、WM esim-redeemed webhook、esim.ts、gift.ts）都改為帶該訂單所屬租戶 → **A 商店訂單用 A 商店 LINE OA 推播**，且修掉「目前一封都沒送」的問題。
- **session 解耦**：`session.ts` 改用 `SESSION_SECRET`，未設定時相容退回 `LINE_CHANNEL_SECRET`（現有登入不會失效）。
- **`.env.example`**：新增 `SESSION_SECRET`、`TAPPAY_LINEPAY_MERCHANT_ID`，並標註 LINE/金流/eSIM 為各租戶後台設定、env 僅 fallback。

> ⚠ 注意：P0 推播修好後，會「開始真的送」付款/發卡/轉贈通知。前提是**該白牌後台已填 Messaging API Access Token**（否則仍會靜默跳過）。請確認 Bee旅 等正式租戶後台都已填妥。
