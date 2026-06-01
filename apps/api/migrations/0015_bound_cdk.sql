-- Step 10: 号码绑定型 CDK (Type C) - yamasakisms

-- 新增 provider_tokens 表（yamasakisms access_token 持久化）
CREATE TABLE IF NOT EXISTS provider_tokens (
  provider_slug TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 为 bound 类型 active 订单的手机号添加部分唯一索引
-- 防止同一手机号被多个 CDK 同时绑定
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_active_phone
  ON orders (phone_number)
  WHERE status = 'active';
