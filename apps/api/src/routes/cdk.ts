import { Hono } from 'hono'
import { eq, and, sql } from 'drizzle-orm'
import { getDb, cdks, services, orders, providers } from '../db'
import { getProvider, getApiKey } from '../adapters'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// POST /api/cdk/validate
app.post('/validate', async (c) => {
  const body = await c.req.json<{ code: string }>()
  const db = getDb(c.env.DB)

  const [row] = await db
    .select({
      id: cdks.id,
      status: cdks.status,
      remainingUses: cdks.remainingUses,
      totalUses: cdks.totalUses,
      serviceName: services.name,
    })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))
    .where(eq(cdks.code, body.code))

  if (!row) {
    return c.json({ error: 'CDK 不存在或已失效' }, 404)
  }

  if (row.status === 'disabled') {
    return c.json({ error: 'CDK 已停用' }, 400)
  }

  if (row.remainingUses === 0 || row.status === 'exhausted') {
    return c.json({ error: 'CDK 次数已用完' }, 400)
  }

  // 检查是否有 pending 订单
  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(and(eq(orders.cdkId, row.id), eq(orders.status, 'pending')))

  if (pendingRow.count > 0) {
    return c.json({ error: 'CDK 正在使用中，请等待当前流程完成' }, 400)
  }

  return c.json({
    cdkId: row.id,
    service: { name: row.serviceName },
    remaining: row.remainingUses,
    total: row.totalUses,
  })
})

// POST /api/cdk/order
app.post('/order', async (c) => {
  const body = await c.req.json<{ cdkId: string }>()
  const db = getDb(c.env.DB)

  // 查 CDK + service + provider（防并发再次验证）
  const [row] = await db
    .select({
      cdkId: cdks.id,
      cdkStatus: cdks.status,
      remainingUses: cdks.remainingUses,
      serviceId: cdks.serviceId,
      externalServiceId: services.externalServiceId,
      maxPrice: services.maxPrice,
      successRateThreshold: services.successRateThreshold,
      blockedCountries: services.blockedCountries,
      providerSlug: providers.slug,
      providerName: providers.name,
    })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(eq(cdks.id, body.cdkId))

  if (!row) {
    return c.json({ error: 'CDK 不存在或已失效' }, 404)
  }

  if (row.cdkStatus === 'disabled') {
    return c.json({ error: 'CDK 已停用' }, 400)
  }

  if (row.remainingUses === 0 || row.cdkStatus === 'exhausted') {
    return c.json({ error: 'CDK 次数已用完' }, 400)
  }

  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(and(eq(orders.cdkId, body.cdkId), eq(orders.status, 'pending')))

  if (pendingRow.count > 0) {
    return c.json({ error: 'CDK 正在使用中，请等待当前流程完成' }, 400)
  }

  // 插入 pending 订单
  const orderId = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.insert(orders).values({
    id: orderId,
    cdkId: body.cdkId,
    status: 'pending',
    createdAt: now,
  })

  // 调用 SMS 适配器
  try {
    const apiKey = getApiKey(row.providerSlug!, c.env)
    const adapter = getProvider(row.providerSlug!, apiKey)

    const result = await adapter.orderNumber(row.externalServiceId!, {
      maxPrice: row.maxPrice!,
      successRateThreshold: row.successRateThreshold!,
      blockedCountries: JSON.parse(row.blockedCountries ?? '[]') as string[],
    })

    const expiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString()

    await db
      .update(orders)
      .set({
        externalOrderId: result.orderId,
        phoneNumber: result.phoneNumber,
        expiresAt,
      })
      .where(eq(orders.id, orderId))

    return c.json({
      orderId,
      phoneNumber: result.phoneNumber,
      expiresIn: result.expiresIn,
    })
  } catch (err) {
    await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, orderId))

    const message = err instanceof Error ? err.message : '获取号码失败，请稍后重试'
    return c.json({ error: message }, 400)
  }
})

// GET /api/cdk/order/:orderId/status
app.get('/order/:orderId/status', async (c) => {
  const orderId = c.req.param('orderId')
  const db = getDb(c.env.DB)

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))

  if (!order) {
    return c.json({ error: '订单不存在' }, 404)
  }

  // 终态直接返回缓存结果
  if (order.status === 'completed') {
    return c.json({
      status: 'completed',
      smsContent: order.smsContent,
      verificationCode: order.verificationCode,
    })
  }

  if (order.status === 'expired' || order.status === 'cancelled') {
    return c.json({ status: order.status })
  }

  // status=pending，调 SMSPool 轮询
  if (!order.externalOrderId) {
    return c.json({ status: 'pending', timeLeft: null })
  }

  // 查 provider slug: order → cdkId → cdk → serviceId → service → providerId → provider
  const [providerRow] = await db
    .select({ slug: providers.slug })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(eq(cdks.id, order.cdkId))

  if (!providerRow?.slug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  try {
    const adapter = getProvider(providerRow.slug, getApiKey(providerRow.slug, c.env))
    const pollResult = await adapter.pollOrder(order.externalOrderId)
    const now = new Date().toISOString()

    if (pollResult.status === 'completed') {
      await db
        .update(orders)
        .set({
          status: 'completed',
          smsContent: pollResult.smsContent ?? null,
          verificationCode: pollResult.verificationCode ?? null,
          completedAt: now,
        })
        .where(eq(orders.id, orderId))

      // 扣减 CDK 次数，若减到 0 则标记为 exhausted
      const [cdk] = await db.select().from(cdks).where(eq(cdks.id, order.cdkId))
      if (cdk) {
        const newRemaining = Math.max(0, cdk.remainingUses - 1)
        await db
          .update(cdks)
          .set({
            remainingUses: newRemaining,
            status: newRemaining === 0 ? 'exhausted' : cdk.status,
          })
          .where(eq(cdks.id, order.cdkId))
      }

      return c.json({
        status: 'completed',
        smsContent: pollResult.smsContent,
        verificationCode: pollResult.verificationCode,
      })
    }

    if (pollResult.status === 'expired' || pollResult.status === 'cancelled') {
      await db
        .update(orders)
        .set({ status: pollResult.status })
        .where(eq(orders.id, orderId))

      return c.json({ status: pollResult.status })
    }

    // pending
    return c.json({ status: 'pending', timeLeft: pollResult.timeLeft })
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询状态失败'
    return c.json({ error: message }, 500)
  }
})

export default app
