-- 补全 orders / order_sms / login_attempts 索引，提升查询性能
CREATE INDEX IF NOT EXISTS idx_orders_cdk_id ON orders(cdk_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_cdk_status ON orders(cdk_id, status);
CREATE INDEX IF NOT EXISTS idx_order_sms_order_id ON order_sms(order_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, created_at);
