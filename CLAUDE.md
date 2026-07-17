@AGENTS.md

# 開發守則（每次改動前必讀；每條都對應過真實 bug 或審計發現）

## A. 改動流程與紀律
**改之前**
- 先讀要改的檔案＋相鄰程式碼，照既有寫法改（命名、inline style、註解密度、結構），不引進新風格／新套件／新狀態管理。
- 確認是在改 live 程式（根目錄 `app/`），不是 `app-src/` 死碼（獨立巢狀 git repo、不在 build 內）。
- 不確定就先查證再動手：用 DB / log / 實際程式碼確認根因，不要用猜的（measure before fixing）。

**改的時候（程式碼不要亂）**
- 最小且聚焦：只動跟本次目標相關的行，不順手重構無關區塊、不改格式。
- 走既有單一來源，不要複製貼上另寫一份（如 `deriveEsimStatus`、`useLiffBase`、`lib/utils/liff-url`）。
- 動到正在運作的流程（金流、polling、webhook、proxy、order 狀態機）時，保留既有邏輯與防呆，只加必要的；沒把握的程式不要刪。
- 串接/debug 看不到 log 時，先把資料捕捉到可讀處（暫時 DB 表或回傳）；釐清後**務必移除暫時診斷碼與表**。

**改完之後（驗證，缺一不可）**
- 一律 `npx tsc --noEmit`（必須 0 錯）。
- 對動到的檔案跑 `npx eslint <file>`；**不可新增** lint 錯誤（既有舊問題如 set-state-in-effect 可不處理，但別擴大）。
- 能驗證行為就驗證：用實際資料 / Record API / DB 確認，**別只看畫面**（sandbox「成功」≠ 系統真的收到）。
- 雙路由 / 共用元件改動，用 grep 自查所有使用處一致。

**commit**：一個邏輯一包、訊息 `type(scope): 中文說明`、結尾帶 Co-Authored-By；未經要求不擅自 push。

## B. 架構與多租戶
- 多租戶 = `PlatformAdmin`（白標品牌），**不是** Group（Group 是租戶底下的社群）。slug → tenant 用 `lib/services/tenant.ts`。
- 每個 tenant 各有 `liffId`、`tenantPaymentConfig`(TapPay)、`tenantEsimConfig`(世界移動)。設定一律 by `tenantAdminId` 解析，env 只能當 fallback，別把全域 env 當預設值。
- 世界移動「測試/正式」是兩台獨立主機，各有不同 merchantId/deptId/token 與 **wmproductId**。
- **無 DB RLS**，全靠 app 層 auth：每個 query 都要自己帶 `tenantAdminId` / `userId` / `ownerId` 過濾，別假設拿得到的資料已被隔離。

## C. LIFF 前端
- 純 inline CSS-in-JS（**無 Tailwind、無全域 CSS**）；顏色用 `useTenantColors()` 的 `C.*`，禁止寫死品牌色；動畫用 `<style>` 內 `@keyframes`。
- 導頁一律用 `useLiffBase()` 的 `${base}`（= `/liff/<slug>`）拼接，禁止寫死 `/orders`、`/products`；付款 3DS/LINE Pay 回跳網址要用 `liff.permanentLink` 轉 `liff.line.me`（一般 https 會被 LINE 用外部瀏覽器開）。
- eSIM/訂單狀態的文案與配色單一來源是 `lib/esimStatus.ts` 的 `deriveEsimStatus()`；UI 不要各自比對 raw enum。
- 購物車綁 LINE `userId`（換人自動清）；開場 splash 只在首頁。

## D. proxy / API 閘門（最容易踩）
- `proxy.ts` 對所有 `/api/*` 要求 session，除非列在 `PUBLIC_API`。任何「第三方 server→server 回呼」（TapPay notify、世界移動 webhook、Vercel cron）一定要加進 `PUBLIC_API`，否則 route 執行前就被 401（症狀：對方有送、訂單卻不動）。route 內部要自行驗章。
- 三種第三方入口的驗證方式各不同，別張冠李戴：**TapPay notify** 不帶簽章 → 用 `rec_trade_id` 打 Record API 回查驗真；**世界移動 webhook**（`/api/webhooks/wm/*`）WM 不提供簽章 → 用 `wmOrderId + esimRcode` 雙欄位比對防偽，且務必保留冪等檢查（如 `activatedAt` 已存在就略過）；**cron** → `CRON_SECRET` fail-closed（未設定一律拒絕）。不要替 WM webhook 硬加不存在的簽章驗證，也不要拿掉雙比對或冪等。
- 標準 auth：LIFF user route 驗 `SESSION_COOKIE`（verifySession）；platform/admin route 用 `requirePlatformAuth`。錯誤回傳統一 `{ error }` + 對應 status。

## E. 金流 / eSIM 串接不變量（改這些前先讀文件＋既有測試）
- **不可移除的 idempotency 守門**：`markOrderProcessing` 的條件鎖、coupon `updateMany` 的 `count===1` 檢查、gift claim 的 `claimedAt IS NULL`、`Commission.orderId` unique。這些看起來繞，是在擋並發重複扣款/重複用券。
- 退款回沖有既有單一來源，改退款流程一律沿用、別另寫：券用 `restoreCouponsForRefundedOrders`（只在「整捆全退」時還券，單張部分退款不動券）、分潤用 `cancelCommission`（沖銷 pending＋settled）。
- `Order.currentOwnerId` ≠ `userId`（轉贈後會變）；查「使用者的訂單」一律用 `currentOwnerId`。
- TapPay：3DS body 的 `three_domain_secure` 與 `result_url` 要在**最外層**（`tests/tappay-3ds-body.test.ts` 鎖住）；notify **不帶 x-api-key**，用 `rec_trade_id` 打 Record API 回查驗真（注意查到資料時 `status` 回 **2「End of list」**、非 0）。
- 世界移動三組簽章別搞混：下單 `SHA1(merchantId+deptId+email+(wmproductId+qty)+token)`、兌換 `SHA1(merchantId+rcode+qrcodeType(=2)+token)`、報價 `SHA1(merchantId+token)`（不含 deptId/body）。wmproductId 必須由 `myQueryAll` 同步（後台商品匯入），格式 `WM_000001`，**不可手填假 SKU**。WM 回應成功是 body `code===0`（不是 HTTP 狀態）。
- 加密欄位（`FIELD_ENCRYPTION_KEY`, AES-256-GCM）：email/phone/bank/世界移動 token/TapPay 金鑰/SavedCard token。讀寫用 `encrypt` / `safeDecrypt`，不要記 log 或外傳明文。
- 嚴禁寫入 log／外傳的敏感欄位（即使目前沒犯也要守住）：TapPay `prime`／金鑰、各家 `secret`／`token`、完整卡號，以及 eSIM 的 `esimQrcode`／`esimLpa`／`esimRcode`／`esimIccid`／`esimPin*`／`esimPuk*`。注意這些 eSIM 欄位目前在 `Order` 是「明文存 DB」（非加密欄位），log 更要避開；是否改加密儲存見 ROADMAP。

## F. 可觀測性與測試（目前的弱點）
- 業務關鍵 async 不可靜默吞錯（守則源自「付款成功卻沒發卡」事件）。notify route 的 `triggerEsimActivation`／`calculateAndSaveCommission`／`issueRepurchaseCouponForOrder` **已改為 `await` + `recordAlert`**（開卡須 await 完成才回 200，否則 Vercel serverless 凍結背景工作 → 沒發卡）；非交付關鍵的 fire-and-forget（如 `notifyOrderPaid`）用 `fireAndLog` 記 `system_alerts`。新增這類流程沿用同作法，禁用 `.catch(()=>{})`。
- 核心流程（下單、付款 webhook、bundle、coupon 組合、eSIM 開卡、分潤）**目前沒有測試**，只有 utils 有。改這些要格外小心，能補 test 就補。
- 留在程式裡的 `console.log` 多為 TapPay/WM 診斷；長期應收斂到分級 logger。
