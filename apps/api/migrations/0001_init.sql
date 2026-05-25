CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  external_service_id TEXT NOT NULL,
  success_rate_threshold INTEGER NOT NULL DEFAULT 70,
  max_price REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS cdks (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL,
  total_uses INTEGER NOT NULL,
  remaining_uses INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  cdk_id TEXT NOT NULL,
  external_order_id TEXT,
  phone_number TEXT,
  sms_content TEXT,
  verification_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (cdk_id) REFERENCES cdks(id)
);
