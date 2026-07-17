-- 效能索引 + 清理診斷表（手動套用，本專案慣例：prisma/migrations/*.sql 手動執行）
-- Postgres 不會為 FK 自動建索引；以下補上熱查詢路徑缺的索引（audit §2）。
-- 皆 IF NOT EXISTS，可重複執行。

-- products：每次商品/首頁查詢都過濾 tenant + status，並依 country 分組；FK supplier_sku_id 常 join
CREATE INDEX IF NOT EXISTS idx_products_tenant_status ON products (tenant_admin_id, status);
CREATE INDEX IF NOT EXISTS idx_products_country       ON products (country_code);
CREATE INDEX IF NOT EXISTS idx_products_supplier_sku  ON products (supplier_sku_id);

-- orders：getUserOrders 用 current_owner_id；dashboard/cron 用 status；分潤/查詢用 user_id
CREATE INDEX IF NOT EXISTS idx_orders_current_owner ON orders (current_owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_user          ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders (status);

-- order_items：join orders / products
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);

-- coupons：getUserCoupons(owner_id)；退款歸還/作廢用 used_order_id / source_order_id
CREATE INDEX IF NOT EXISTS idx_coupons_owner        ON coupons (owner_id);
CREATE INDEX IF NOT EXISTS idx_coupons_used_order   ON coupons (used_order_id);
CREATE INDEX IF NOT EXISTS idx_coupons_source_order ON coupons (source_order_id);

-- commissions：依社群查待結算；結算單關聯
CREATE INDEX IF NOT EXISTS idx_commissions_group      ON commissions (group_id);
CREATE INDEX IF NOT EXISTS idx_commissions_settlement ON commissions (settlement_id);

-- 移除一次性診斷表（已改由 system_alerts + 後台儀表板告警取代）
DROP TABLE IF EXISTS tappay_notify_log;
DROP TABLE IF EXISTS wm_order_log;
