-- D1 持久化限流表：固定窗口，每 IP 仅一行，无需 Cron 清理
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,      -- 如 "validate:1.2.3.4"
  count INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL
);
