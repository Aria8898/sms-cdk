-- SMSBower 官方 API 服务代码（如 'oi'），与内部数字 ID（externalServiceId）分开存储
ALTER TABLE services ADD COLUMN smsbower_service_code TEXT;
