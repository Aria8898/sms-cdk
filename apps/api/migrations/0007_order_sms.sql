-- Step 6: order_sms 表，记录同一激活内的多条短信
CREATE TABLE IF NOT EXISTS order_sms (
  id          TEXT NOT NULL PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  sms_content TEXT NOT NULL DEFAULT '',
  verification_code TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL
);

-- orders.status 已是 TEXT 类型，直接支持 'received' 值，无需额外 DDL
