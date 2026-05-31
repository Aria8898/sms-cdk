import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { eq, and, sql } from 'drizzle-orm'
import type { Bindings, Variables } from './types'
import { getDb, orders, cdks, services, providers } from './db'
import { getProvider, getApiKey } from './adapters'
import { log, writeAuditLog } from './lib/logger'
import authRoute from './routes/auth'
import providersRoute from './routes/providers'
import serviceCategoriesRoute from './routes/service-categories'
import servicesRoute from './routes/services'
import cdksRoute from './routes/cdks'
import cdkRoute from './routes/cdk'
import poolRoute from './routes/pool'
import securityRoute from './routes/security'
import auditRoute from './routes/audit'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// 全局 requestId 中间件
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  await next()
})

app.route('/api/auth', authRoute)
app.route('/api/providers', providersRoute)
app.route('/api/service-categories', serviceCategoriesRoute)
app.route('/api/services', servicesRoute)
app.route('/api/cdks', cdksRoute)
app.route('/api/cdk', cdkRoute)
app.route('/api/pool-status', poolRoute)
app.route('/api/security', securityRoute)
app.route('/api/audit-logs', auditRoute)

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ─── Cron Handler：清理超时 pending 订单 ──────────────────────────────────────

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    const db = getDb(env.DB)
    const now = new Date().toISOString()

    // 查找所有 pending 且已超过 expiresAt 的订单
    const expiredPending = await db
      .select({ id: orders.id, cdkId: orders.cdkId, cdkType: cdks.cdkType })
      .from(orders)
      .leftJoin(cdks, eq(cdks.id, orders.cdkId))
      .where(
        and(
          eq(orders.status, 'pending'),
          sql`${orders.expiresAt} IS NOT NULL AND ${orders.expiresAt} < ${now}`,
        ),
      )

    let cleaned = 0
    for (const row of expiredPending) {
      await db
        .update(orders)
        .set({ status: 'expired', completedAt: now })
        .where(eq(orders.id, row.id))
      cleaned++
    }

    // 清理超时的 received 订单（用户收到短信后关闭页面，未调用 /finish）
    const expiredReceived = await db
      .select({
        id: orders.id,
        cdkId: orders.cdkId,
        cdkType: cdks.cdkType,
        externalOrderId: orders.externalOrderId,
        providerSlug: providers.slug,
      })
      .from(orders)
      .leftJoin(cdks, eq(cdks.id, orders.cdkId))
      .leftJoin(services, eq(services.id, orders.serviceId))
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(
        and(
          eq(orders.status, 'received'),
          sql`${orders.expiresAt} IS NOT NULL AND ${orders.expiresAt} < ${now}`,
        ),
      )

    let receivedCleaned = 0
    let receivedConfirmFailed = 0
    for (const row of expiredReceived) {
      if (!row.externalOrderId || !row.providerSlug) {
        receivedConfirmFailed++
        await writeAuditLog(db, 'confirm.failed', 'order', row.id, {
          trigger: 'cron.received_expired',
          error: 'missing externalOrderId or providerSlug',
        })
        continue
      }

      try {
        const adapter = getProvider(row.providerSlug, getApiKey(row.providerSlug, env))
        await adapter.confirmOrder(row.externalOrderId)
      } catch (err) {
        receivedConfirmFailed++
        const message = err instanceof Error ? err.message : String(err)
        log('cron.received_confirm_failed', { orderId: row.id, provider: row.providerSlug, error: message })
        await writeAuditLog(db, 'confirm.failed', 'order', row.id, {
          trigger: 'cron.received_expired',
          provider: row.providerSlug,
          error: message,
        })
        continue
      }

      if (row.cdkType === 'timed') {
        // timed CDK：received 到期 → 已激活，标为 exhausted
        await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, row.cdkId))
      }
      // count CDK：remaining 在首次 received 时已扣减，此处只完成订单闭环
      await db
        .update(orders)
        .set({ status: 'completed', completedAt: now })
        .where(eq(orders.id, row.id))
      receivedCleaned++
    }

    log('cron.cleanup.done', { pendingCleaned: cleaned, receivedCleaned, receivedConfirmFailed })
  },
}
