-- Step 3: CDK 国家专属 + 格式更新
-- cdks 表新增 category_id（直接关联 service_categories）和 country_code

-- 1. 新增 category_id 列（nullable）
ALTER TABLE cdks ADD COLUMN category_id TEXT;

-- 2. 迁移已有数据：从 service_id → services.category_id 补填
UPDATE cdks
SET category_id = (
  SELECT s.category_id
  FROM services s
  WHERE s.id = cdks.service_id
    AND s.category_id IS NOT NULL
);

-- 3. 新增 country_code 列（nullable，ISO 2字母码，如 'US'）
ALTER TABLE cdks ADD COLUMN country_code TEXT;
