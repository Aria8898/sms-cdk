import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { eq, and, sql } from 'drizzle-orm'
import type { Bindings, Variables } from './types'
import { getDb, orders, cdks, services, providers, orderSms, rateLimits } from './db'
import { getProvider, getApiKey, getBoundProvider } from './adapters'
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
import yamasakismsRoute from './routes/yamasakisms'

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
app.route('/api/yamasakisms', yamasakismsRoute)

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ─── GET /api/:code — 对外接码 API（bound CDK 专属）──────────────────────────
// 限速：20次/分钟/CDK；服务端缓存：3秒（Cloudflare Cache API）；CORS: *

app.get('/api/:code', async (c) => {
  const cdkCode = c.req.param('code')

  // 基本格式校验（CDK 含连字符，排除与其他路由的冲突）
  if (!cdkCode.includes('-')) {
    return c.json({ code: 0, msg: '无效的链接/查询码错误' }, 404)
  }

  const db = getDb(c.env.DB)
  const rateMax = parseInt(c.env.RATE_LIMIT_CODE_API ?? '20', 10)

  // ── 限速（D1 固定窗口，key = code_api:{cdkCode}）──────────────────────────
  try {
    const rateKey = `code_api:${cdkCode}`
    await db.run(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${rateKey}, 1, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        count = CASE
          WHEN window_start > datetime('now', '-60 seconds') THEN count + 1
          ELSE 1
        END,
        window_start = CASE
          WHEN window_start > datetime('now', '-60 seconds') THEN window_start
          ELSE datetime('now')
        END
    `)
    const [rateRow] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, rateKey))
    if ((rateRow?.count ?? 1) > rateMax) {
      return c.json({ code: 0, msg: '请求过于频繁，请稍后重试' }, 429)
    }
  } catch {
    // 限速表不存在时 fail-open
  }

  // ── 查询 CDK 及关联 active 订单 ──────────────────────────────────────────
  const [cdkRow] = await db
    .select({ id: cdks.id, status: cdks.status, cdkType: cdks.cdkType })
    .from(cdks)
    .where(eq(cdks.code, cdkCode))

  if (!cdkRow || cdkRow.cdkType !== 'bound' || cdkRow.status !== 'exhausted') {
    return c.json({ code: 0, msg: '无效的链接/查询码错误' })
  }

  const nowIso = new Date().toISOString()
  const [boundOrder] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.cdkId, cdkRow.id), eq(orders.status, 'active')))
    .limit(1)

  if (!boundOrder) {
    // 可能已过期
    return c.json({ code: 0, msg: '无效的链接/查询码错误' })
  }

  // 检查是否过期
  if (boundOrder.expiresAt && boundOrder.expiresAt < nowIso) {
    await db.update(orders).set({ status: 'expired', completedAt: nowIso }).where(eq(orders.id, boundOrder.id))
    return c.json({ code: 0, msg: '无效的链接/查询码错误' })
  }

  const orderNo = boundOrder.externalOrderId
  const expiredDate = boundOrder.expiresAt ? boundOrder.expiresAt.replace('T', ' ').replace(/\.\d{3}Z$/, '') : ''

  if (!orderNo) {
    return c.json({ code: 0, msg: '无效的链接/查询码错误' })
  }

  // ── 3 秒 Cloudflare Cache API ──────────────────────────────────────────────
  const cacheKey = new Request(`https://cache.internal/bound-code/${orderNo}`, { method: 'GET' })
  const cache = caches.default

  const cached = await cache.match(cacheKey)
  if (cached) {
    const body = await cached.json()
    return c.json(body, 200, { 'X-Cache': 'HIT', 'Access-Control-Allow-Origin': '*' })
  }

  // ── 调 yamasakisms 获取最新验证码 ─────────────────────────────────────────
  try {
    // 解析 providerSlug：优先用订单的 serviceId，否则从 CDK 的 serviceId 查
    let providerSlug: string | null = null
    if (boundOrder.serviceId) {
      const [svcRow] = await db
        .select({ slug: providers.slug })
        .from(services)
        .leftJoin(providers, eq(providers.id, services.providerId))
        .where(eq(services.id, boundOrder.serviceId))
      providerSlug = svcRow?.slug ?? null
    }
    if (!providerSlug) {
      const [cdkSvc] = await db
        .select({ slug: providers.slug })
        .from(cdks)
        .leftJoin(services, eq(services.id, cdks.serviceId))
        .leftJoin(providers, eq(providers.id, services.providerId))
        .where(eq(cdks.id, cdkRow.id))
      providerSlug = cdkSvc?.slug ?? null
    }

    if (!providerSlug) {
      return c.json({ code: 0, msg: '无效的链接/查询码错误' })
    }

    const adapter = getBoundProvider(providerSlug, c.env, c.env.DB)
    const result = await adapter.getLatestCode(orderNo)

    // 与 order_sms 最后一条比较，若不同则写入新记录
    if (result) {
      const [lastSms] = await db
        .select()
        .from(orderSms)
        .where(eq(orderSms.orderId, boundOrder.id))
        .orderBy(sql`${orderSms.receivedAt} DESC`)
        .limit(1)

      if (!lastSms || lastSms.smsContent !== result.code) {
        await db.insert(orderSms).values({
          id: crypto.randomUUID(),
          orderId: boundOrder.id,
          smsContent: result.code,
          verificationCode: result.code,
          receivedAt: result.codeTime,
        })
      }
    }

    const responseBody = result
      ? {
          code: 1,
          msg: 'ok',
          data: {
            code: result.code,
            code_time: result.codeTime,
            expired_date: expiredDate,
          },
        }
      : {
          code: 0,
          msg: 'No verification code',
          data: { expired_date: expiredDate },
        }

    // 写入 3 秒缓存
    const cacheResponse = new Response(JSON.stringify(responseBody), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3',
        'Access-Control-Allow-Origin': '*',
      },
    })
    c.executionCtx.waitUntil(cache.put(cacheKey, cacheResponse.clone()))

    return c.json(responseBody, 200, { 'Access-Control-Allow-Origin': '*' })
  } catch (err) {
    log('code_api.error', { cdkCode, error: err instanceof Error ? err.message : String(err) })
    return c.json({ code: 0, msg: '查询失败，请稍后重试' }, 500)
  }
})

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
