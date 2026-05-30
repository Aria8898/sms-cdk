-- Step 9: 短效时效型 CDK (Type A) + 安全防护

-- cdks: CDK 类型和有效分钟数
ALTER TABLE cdks ADD COLUMN cdk_type TEXT NOT NULL DEFAULT 'count';
ALTER TABLE cdks ADD COLUMN validity_minutes INTEGER;

-- orders: 附加追踪字段
ALTER TABLE orders ADD COLUMN error_message TEXT;
ALTER TABLE orders ADD COLUMN cost REAL;
ALTER TABLE orders ADD COLUMN ip_address TEXT;

-- login_attempts: 登录尝试安全审计表
CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  ip_address TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
