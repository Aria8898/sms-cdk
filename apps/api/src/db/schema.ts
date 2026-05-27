import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  alias: text('alias').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const serviceCategories = sqliteTable('service_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  createdAt: text('created_at').notNull(),
})

export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  categoryId: text('category_id'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  // name / shortName kept for legacy data and CDK code generation fallback
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  externalServiceId: text('external_service_id').notNull(),
  successRateThreshold: integer('success_rate_threshold').notNull().default(70),
  maxPrice: real('max_price').notNull().default(0.5),
  blockedCountries: text('blocked_countries').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
})

export const cdks = sqliteTable('cdks', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  serviceId: text('service_id').notNull(),
  // Step 3: 新增 category_id（直接关联 service_categories）和 country_code
  categoryId: text('category_id'),
  countryCode: text('country_code'),
  totalUses: integer('total_uses').notNull(),
  remainingUses: integer('remaining_uses').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
})

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  cdkId: text('cdk_id').notNull(),
  serviceId: text('service_id'),
  externalOrderId: text('external_order_id'),
  phoneNumber: text('phone_number'),
  smsContent: text('sms_content'),
  verificationCode: text('verification_code'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  expiresAt: text('expires_at'),
})

export const poolStatusCache = sqliteTable('pool_status_cache', {
  serviceId: text('service_id').primaryKey(),
  data: text('data').notNull(),
  cachedAt: text('cached_at').notNull(),
})
