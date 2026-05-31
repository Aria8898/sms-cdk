-- 持久审计日志表：记录关键业务事件（CDK 核销、订单状态变更、取消失败等）
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,       -- 'cdk.validated' | 'order.created' | 'order.status_changed' | 'cdk.exhausted' | 'cancel.failed'
  entity_type TEXT NOT NULL, -- 'cdk' | 'order'
  entity_id TEXT NOT NULL,   -- 对应的 cdkId 或 orderId
  meta TEXT,                 -- JSON: ip、旧状态、新状态、错误信息等
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_id, created_at);
CREATE INDEX idx_audit_event ON audit_logs(event, created_at);
