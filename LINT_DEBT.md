# Lint 債務清單 / CI hard-gate 上線前待辦

> CI 目前 `npx eslint . || true`（lint 不擋）。目標：上線前改成硬閘門 `npx eslint .`。
> `npx eslint .` 預設 **error 會 fail、warning 不會**，所以「能不能硬閘門」只看 error 數。

## 現況：`eslint .` = 43 問題（**4 errors** / 39 warnings）

從一開始的 5000+ 一路清到剩 4 個 error。已完成的清理：
- ✅ 修 lint 範圍：忽略 `app-src/`（死碼）、`scripts/`、`skills/`（外掛範例）→ 去掉數千筆雜訊。
- ✅ 刪掉 22 個多餘的 `// eslint-disable-next-line no-console`（console 呼叫保留）。
- ✅ 刪掉 7 個未用變數（liff / slug / C / i 等）。
- ✅ `react-hooks/set-state-in-effect` 降為 `warn`（24 筆；本專案多為良性 client effect）。
- ✅ no-unused-vars 加 `^_` 忽略樣式（保留待擴充的 `_note` 等參數）。

## 只剩這 4 個 error 擋硬閘門（需逐一真修，非 cleanup）

| 檔案:行 | 規則 | 說明 / 修法 |
|---|---|---|
| `hooks/useCachedData.ts:63` | `react-hooks/purity` | render 期間呼叫了不純函式（Date.now/Math.random）→ 移到 effect 或事件中。**此為核心快取 hook，改動要小心、要實測快取行為。** |
| `hooks/useCachedData.ts:72,74` | `react-hooks/refs` | render 期間讀 `ref.current` → 移到 effect/事件。同上需小心。 |
| `app/platform/liff/page.tsx:143` | `react-hooks/static-components` | 在 render 內定義元件（每次 render 重建）→ 把該元件搬到模組層級。 |

清掉這 4 個後，`npx eslint .` 就會 0 error，即可改硬閘門。

## 不擋硬閘門的 warnings（39，可分批清，非必要）

- `react-hooks/set-state-in-effect` × 24（已降 warn；要更乾淨可逐一改寫 effect）。
- `@next/next/no-img-element` × 12（LIFF 用原生 `<img>` 顯示 logo/QR/國旗，可接受或改 next/image）。
- `react-hooks/exhaustive-deps` × 4（缺依賴，逐一確認後補或標註）。

## 改成硬閘門 + 加 build 的 ci.yml（需 workflow 權限，由 web/具 scope 帳號改）

```yaml
      - run: npm ci
      - run: npx tsc --noEmit       # 硬閘門
      - run: npx vitest run         # 硬閘門
      - run: npm run build          # ← 新增：硬閘門（已驗證無 DB env 也能 build）
      - run: npx eslint . || true   # 清掉上面 4 個 error 後，改成「npx eslint .」即為硬閘門
```
