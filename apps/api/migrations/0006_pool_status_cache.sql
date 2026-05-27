-- Step 4: pool_status_cache 表 + orders.service_id

-- 1. 运营商号池状态缓存（5 分钟 TTL）
CREATE TABLE pool_status_cache (
  service_id TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  cached_at  TEXT NOT NULL
);

-- 2. 订单记录实际使用的运营商 service
ALTER TABLE orders ADD COLUMN service_id TEXT;
