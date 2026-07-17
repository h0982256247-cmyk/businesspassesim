-- Add failure_reason / cancel_reason columns to orders table.
-- Both are nullable text; no default. Safe to run on production.
--
-- 失敗 / 取消原因（給 LIFF 前端顯示）：
--   failure_reason — FAILED 時的人類可讀說明，例如「您已取消付款」、「銀行拒絕（代碼 30040）」
--   cancel_reason  — CANCELLED 時的說明，例如「逾時自動取消」、「使用者手動取消」
--
-- 以後若舊資料想 backfill：
--   UPDATE orders SET cancel_reason = '逾時自動取消'
--   WHERE status = 'CANCELLED' AND cancel_reason IS NULL;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS cancel_reason  text;
