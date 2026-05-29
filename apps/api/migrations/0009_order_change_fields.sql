-- Step 8: 换号次数、取消原因、取号时间
ALTER TABLE orders ADD COLUMN change_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN cancelled_reason TEXT;
ALTER TABLE orders ADD COLUMN ordered_at TEXT;
