CREATE TABLE IF NOT EXISTS service_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE services ADD COLUMN category_id TEXT;
ALTER TABLE services ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
