import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  alias: text('alias').notNull().default(''),
  createdAt: text('created_at').notNull(),
})

export const services = sqliteTable('services', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
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
  totalUses: integer('total_uses').notNull(),
  remainingUses: integer('remaining_uses').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
})

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  cdkId: text('cdk_id').notNull(),
  externalOrderId: text('external_order_id'),
  phoneNumber: text('phone_number'),
  smsContent: text('sms_content'),
  verificationCode: text('verification_code'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  expiresAt: text('expires_at'),
})
