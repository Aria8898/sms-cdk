import { Hono } from 'hono'
import { eq, and, sql, or } from 'drizzle-orm'
import {
  getDb,
  cdks,
  services,
  orders,
  providers,
  serviceCategories,
  poolStatusCache,
  orderSms,
} from '../db'
import { getProvider, getApiKey } from '../adapters'
import type { PoolCountryStatus } from '../adapters/types'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// ─── Pool 状态缓存 ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000  // 5 分钟
const POOL_FETCH_TIMEOUT = 3000       // 3 秒超时兜底

interface ServiceMeta {
  id: string
  externalServiceId: string
  isDefault: boolean
  providerSlug: string
  alias: string
}

interface PoolEntry {
  serviceId: string
  alias: string
  isDefault: boolean
  hasStock: boolean
}

/**
 * 读取 pool_status_cache；若过期或不存在则并发调用适配器更新。
 * countryCode 不为空时只检查该国是否有库存。
 */
async function resolvePoolEntry(
  db: ReturnType<typeof getDb>,
  svc: ServiceMeta,
  env: Bindings,
  countryCode: string | undefined,
  forceRefresh = false,
): Promise<PoolEntry> {
  let statusData: PoolCountryStatus[] | null = null

  if (!forceRefresh) {
    const [cached] = await db
      .select()
      .from(poolStatusCache)
      .where(eq(poolStatusCache.serviceId, svc.id))

    if (cached) {
      const ageMs = Date.now() - new Date(cached.cachedAt).getTime()
      if (ageMs < CACHE_TTL_MS) {
        statusData = JSON.parse(cached.data) as PoolCountryStatus[]
      }
    }
  }

  if (!statusData) {
    try {
      const adapter = getProvider(svc.providerSlug, getApiKey(svc.providerSlug, env))
      statusData = await Promise.race([
        adapter.getPoolStatus(svc.externalServiceId),
        new Promise<PoolCountryStatus[]>((_, reject) =>
          setTimeout(() => reject(new Error('pool status timeout')), POOL_FETCH_TIMEOUT),
        ),
      ])
    } catch (err) {
      console.warn(`[pool-cache] fetch failed for service ${svc.id}:`, err)
      statusData = []
    }

    // 写入 / 更新缓存（尽力，忽略失败）
    try {
      const now = new Date().toISOString()
      await db
        .insert(poolStatusCache)
        .values({ serviceId: svc.id, data: JSON.stringify(statusData), cachedAt: now })
        .onConflictDoUpdate({
          target: poolStatusCache.serviceId,
          set: { data: JSON.stringify(statusData), cachedAt: now },
        })
    } catch (err) {
      console.warn(`[pool-cache] write failed for service ${svc.id}:`, err)
    }
  }

  let hasStock: boolean
  if (countryCode) {
    const upper = countryCode.toUpperCase()
    const entry = statusData.find(c => String(c.shortName).toUpperCase() === upper)
    hasStock = (entry?.stock ?? 0) > 0
  } else {
    hasStock = statusData.some(c => c.stock > 0)
  }

  return { serviceId: svc.id, alias: svc.alias, isDefault: svc.isDefault, hasStock }
}

// ─── 公共：获取某 CDK 关联的所有 ServiceMeta ─────────────────────────────────

async function getServiceMetas(
  db: ReturnType<typeof getDb>,
  cdkRow: { categoryId: string | null; serviceId: string },
): Promise<ServiceMeta[]> {
  // 确定有效 categoryId
  let effectiveCategoryId: string | null = cdkRow.categoryId
  if (!effectiveCategoryId && cdkRow.serviceId) {
    const [svcRow] = await db
      .select({ categoryId: services.categoryId })
      .from(services)
      .where(eq(services.id, cdkRow.serviceId))
    effectiveCategoryId = svcRow?.categoryId ?? null
  }

  if (effectiveCategoryId) {
    return db
      .select({
        id: services.id,
        externalServiceId: services.externalServiceId,
        isDefault: services.isDefault,
        providerSlug: providers.slug,
        alias: providers.alias,
      })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(eq(services.categoryId, effectiveCategoryId)) as Promise<ServiceMeta[]>
  }

  // 旧 CDK：单条 service
  const [legacy] = await db
    .select({
      id: services.id,
      externalServiceId: services.externalServiceId,
      isDefault: services.isDefault,
      providerSlug: providers.slug,
      alias: providers.alias,
    })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(eq(services.id, cdkRow.serviceId))
  return legacy ? [{ ...legacy, isDefault: true } as ServiceMeta] : []
}

// ─── 公共：解析订单对应的 providerSlug ───────────────────────────────────────

async function resolveProviderSlug(
  db: ReturnType<typeof getDb>,
  order: { id: string; serviceId: string | null; cdkId: string },
): Promise<string | null> {
  if (order.serviceId) {
    const [svcRow] = await db
      .select({ slug: providers.slug })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(eq(services.id, order.serviceId))
    if (svcRow?.slug) return svcRow.slug
  }

  const [cdkMeta] = await db
    .select({ categoryId: cdks.categoryId, serviceId: cdks.serviceId })
    .from(cdks)
    .where(eq(cdks.id, order.cdkId))

  if (!cdkMeta) return null

  if (cdkMeta.categoryId) {
    const [svcRow] = await db
      .select({ slug: providers.slug })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(and(eq(services.categoryId, cdkMeta.categoryId), eq(services.isDefault, true)))
      .limit(1)
    if (svcRow?.slug) return svcRow.slug

    const [fallback] = await db
      .select({ slug: providers.slug })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(eq(services.categoryId, cdkMeta.categoryId))
      .limit(1)
    return fallback?.slug ?? null
  }

  const [legacyRow] = await db
    .select({ slug: providers.slug })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(eq(services.id, cdkMeta.serviceId))
  return legacyRow?.slug ?? null
}

// ─── POST /api/cdk/validate ───────────────────────────────────────────────────

app.post('/validate', async (c) => {
  const body = await c.req.json<{ code: string }>()
  const db = getDb(c.env.DB)

  const [row] = await db
    .select({
      id: cdks.id,
      status: cdks.status,
      remainingUses: cdks.remainingUses,
      totalUses: cdks.totalUses,
      countryCode: cdks.countryCode,
      categoryId: cdks.categoryId,
      serviceId: cdks.serviceId,
      serviceName: sql<string>`COALESCE(${serviceCategories.name}, ${services.name})`.as('service_name'),
    })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))
    .leftJoin(serviceCategories, eq(serviceCategories.id, cdks.categoryId))
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

  // 检查是否有进行中的订单（pending 或 received）
  const [activeRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(and(
      eq(orders.cdkId, row.id),
      or(eq(orders.status, 'pending'), eq(orders.status, 'received')),
    ))

  if (activeRow.count > 0) {
    return c.json({ error: 'CDK 正在使用中，请等待当前流程完成' }, 400)
  }

  // 并发查询各运营商号池缓存
  const serviceMetas = await getServiceMetas(db, { categoryId: row.categoryId, serviceId: row.serviceId })
  const pools = await Promise.all(
    serviceMetas.map(svc => resolvePoolEntry(db, svc, c.env, row.countryCode ?? undefined)),
  )

  return c.json({
    cdkId: row.id,
    service: { name: row.serviceName },
    remaining: row.remainingUses,
    total: row.totalUses,
    countryCode: row.countryCode ?? undefined,
    pools,
  })
})

// ─── POST /api/cdk/order ─────────────────────────────────────────────────────

app.post('/order', async (c) => {
  const body = await c.req.json<{ cdkId: string; serviceId?: string }>()
  const db = getDb(c.env.DB)

  const [cdkRow] = await db
    .select({
      cdkId: cdks.id,
      cdkStatus: cdks.status,
      remainingUses: cdks.remainingUses,
      categoryId: cdks.categoryId,
      serviceId: cdks.serviceId,
      countryCode: cdks.countryCode,
    })
    .from(cdks)
    .where(eq(cdks.id, body.cdkId))

  if (!cdkRow) {
    return c.json({ error: 'CDK 不存在或已失效' }, 404)
  }

  if (cdkRow.cdkStatus === 'disabled') {
    return c.json({ error: 'CDK 已停用' }, 400)
  }

  if (cdkRow.remainingUses === 0 || cdkRow.cdkStatus === 'exhausted') {
    return c.json({ error: 'CDK 次数已用完' }, 400)
  }

  const [activeRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(and(
      eq(orders.cdkId, body.cdkId),
      or(eq(orders.status, 'pending'), eq(orders.status, 'received')),
    ))

  if (activeRow.count > 0) {
    return c.json({ error: 'CDK 正在使用中，请等待当前流程完成' }, 400)
  }

  // 确定要使用的 service
  type ServiceRow = {
    id: string
    externalServiceId: string | null
    smsbowerServiceCode: string | null
    maxPrice: number | null
    successRateThreshold: number | null
    blockedCountries: string | null
    providerSlug: string | null
  }

  let serviceRow: ServiceRow | undefined

  if (body.serviceId) {
    // 前端明确指定 serviceId：校验其属于该 CDK 的 category
    const serviceMetas = await getServiceMetas(db, { categoryId: cdkRow.categoryId, serviceId: cdkRow.serviceId })
    const isValid = serviceMetas.some(s => s.id === body.serviceId)
    if (!isValid) {
      return c.json({ error: '指定的运营商不属于该 CDK 的服务类型' }, 400)
    }

    const [found] = await db
      .select({
        id: services.id,
        externalServiceId: services.externalServiceId,
        smsbowerServiceCode: services.smsbowerServiceCode,
        maxPrice: services.maxPrice,
        successRateThreshold: services.successRateThreshold,
        blockedCountries: services.blockedCountries,
        providerSlug: providers.slug,
      })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(eq(services.id, body.serviceId))
    serviceRow = found
  } else if (cdkRow.categoryId) {
    // 新 CDK：从 category 取 isDefault=true 的 service
    const [found] = await db
      .select({
        id: services.id,
        externalServiceId: services.externalServiceId,
        smsbowerServiceCode: services.smsbowerServiceCode,
        maxPrice: services.maxPrice,
        successRateThreshold: services.successRateThreshold,
        blockedCountries: services.blockedCountries,
        providerSlug: providers.slug,
      })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(and(eq(services.categoryId, cdkRow.categoryId), eq(services.isDefault, true)))

    if (!found) {
      const [fallback] = await db
        .select({
          id: services.id,
          externalServiceId: services.externalServiceId,
          smsbowerServiceCode: services.smsbowerServiceCode,
          maxPrice: services.maxPrice,
          successRateThreshold: services.successRateThreshold,
          blockedCountries: services.blockedCountries,
          providerSlug: providers.slug,
        })
        .from(services)
        .leftJoin(providers, eq(providers.id, services.providerId))
        .where(eq(services.categoryId, cdkRow.categoryId))
        .limit(1)
      serviceRow = fallback
    } else {
      serviceRow = found
    }
  } else {
    // 旧 CDK：直接用 service_id
    const [legacy] = await db
      .select({
        id: services.id,
        externalServiceId: services.externalServiceId,
        smsbowerServiceCode: services.smsbowerServiceCode,
        maxPrice: services.maxPrice,
        successRateThreshold: services.successRateThreshold,
        blockedCountries: services.blockedCountries,
        providerSlug: providers.slug,
      })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(eq(services.id, cdkRow.serviceId))
    serviceRow = legacy
  }

  if (!serviceRow?.providerSlug) {
    return c.json({ error: '找不到可用的服务提供商，请联系管理员' }, 500)
  }

  // 插入 pending 订单（记录 service_id）
  const orderId = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.insert(orders).values({
    id: orderId,
    cdkId: body.cdkId,
    serviceId: serviceRow.id,
    status: 'pending',
    createdAt: now,
  })

  try {
    const apiKey = getApiKey(serviceRow.providerSlug, c.env)
    const adapter = getProvider(serviceRow.providerSlug, apiKey)

    const result = await adapter.orderNumber(serviceRow.externalServiceId!, {
      maxPrice: serviceRow.maxPrice!,
      successRateThreshold: serviceRow.successRateThreshold!,
      blockedCountries: JSON.parse(serviceRow.blockedCountries ?? '[]') as string[],
      countryCode: cdkRow.countryCode ?? undefined,
      officialServiceCode: serviceRow.smsbowerServiceCode ?? undefined,
    })

    const expiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString()

    await db
      .update(orders)
      .set({ externalOrderId: result.orderId, phoneNumber: result.phoneNumber, expiresAt })
      .where(eq(orders.id, orderId))

    return c.json({ orderId, phoneNumber: result.phoneNumber, expiresIn: result.expiresIn })
  } catch (err) {
    await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, orderId))

    const message = err instanceof Error ? err.message : '获取号码失败，请稍后重试'
    return c.json({ error: message }, 400)
  }
})

// ─── GET /api/cdk/order/:orderId/status ──────────────────────────────────────

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

  // 已处于 received 状态：返回最新一条 order_sms 给前端（无需再轮询上游）
  if (order.status === 'received') {
    const [cdkRow] = await db.select({ remainingUses: cdks.remainingUses }).from(cdks).where(eq(cdks.id, order.cdkId))
    const [latestSms] = await db
      .select()
      .from(orderSms)
      .where(eq(orderSms.orderId, orderId))
      .orderBy(sql`${orderSms.receivedAt} DESC`)
      .limit(1)

    return c.json({
      status: 'received',
      smsContent: latestSms?.smsContent ?? order.smsContent ?? '',
      verificationCode: latestSms?.verificationCode ?? order.verificationCode ?? '',
      canRetry: (cdkRow?.remainingUses ?? 0) > 0,
    })
  }

  if (!order.externalOrderId) {
    return c.json({ status: 'pending', timeLeft: null })
  }

  const providerSlug = await resolveProviderSlug(db, order)
  if (!providerSlug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  try {
    const adapter = getProvider(providerSlug, getApiKey(providerSlug, c.env))
    const pollResult = await adapter.pollOrder(order.externalOrderId)
    const now = new Date().toISOString()

    // SMSBower：收到短信（received）
    if (pollResult.status === 'received') {
      // 幂等判断：只有 order 当前是 pending 时才写记录 + 扣减
      // （retry 会把 order 设回 pending，所以每次新收到都是 pending → received）
      const smsId = crypto.randomUUID()
      await db.insert(orderSms).values({
        id: smsId,
        orderId,
        smsContent: pollResult.smsContent ?? '',
        verificationCode: pollResult.verificationCode ?? '',
        receivedAt: now,
      })

      // 同步写入 order 表（方便 CDK 详情快速读取最新短信）
      await db
        .update(orders)
        .set({
          status: 'received',
          smsContent: pollResult.smsContent ?? null,
          verificationCode: pollResult.verificationCode ?? null,
        })
        .where(eq(orders.id, orderId))

      // 扣减 CDK 次数
      const [cdk] = await db.select().from(cdks).where(eq(cdks.id, order.cdkId))
      let newRemaining = cdk?.remainingUses ?? 0
      if (cdk) {
        newRemaining = Math.max(0, cdk.remainingUses - 1)
        await db
          .update(cdks)
          .set({ remainingUses: newRemaining, status: newRemaining === 0 ? 'exhausted' : cdk.status })
          .where(eq(cdks.id, order.cdkId))
      }

      return c.json({
        status: 'received',
        smsContent: pollResult.smsContent,
        verificationCode: pollResult.verificationCode,
        canRetry: newRemaining > 0,
      })
    }

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

      const [cdk] = await db.select().from(cdks).where(eq(cdks.id, order.cdkId))
      if (cdk) {
        const newRemaining = Math.max(0, cdk.remainingUses - 1)
        await db
          .update(cdks)
          .set({ remainingUses: newRemaining, status: newRemaining === 0 ? 'exhausted' : cdk.status })
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

    return c.json({ status: 'pending', timeLeft: pollResult.timeLeft })
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询状态失败'
    return c.json({ error: message }, 500)
  }
})

// ─── POST /api/cdk/order/:id/retry ───────────────────────────────────────────
// 再发一条：通知上游重发 SMS，将订单状态回退到 pending

app.post('/order/:orderId/retry', async (c) => {
  const orderId = c.req.param('orderId')
  const db = getDb(c.env.DB)

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) {
    return c.json({ error: '订单不存在' }, 404)
  }
  if (order.status !== 'received') {
    return c.json({ error: '只有已收到短信的订单才可再发一条' }, 400)
  }
  if (!order.externalOrderId) {
    return c.json({ error: '订单缺少外部 ID' }, 400)
  }

  // 检查 CDK 还有剩余次数
  const [cdk] = await db.select({ remainingUses: cdks.remainingUses }).from(cdks).where(eq(cdks.id, order.cdkId))
  if (!cdk || cdk.remainingUses <= 0) {
    return c.json({ error: 'CDK 次数已用完，无法再发' }, 400)
  }

  const providerSlug = await resolveProviderSlug(db, order)
  if (!providerSlug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  try {
    const adapter = getProvider(providerSlug, getApiKey(providerSlug, c.env))
    await adapter.retryOrder(order.externalOrderId)

    // 订单回退到 pending，继续轮询
    await db
      .update(orders)
      .set({ status: 'pending' })
      .where(eq(orders.id, orderId))

    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '再发失败，请稍后重试'
    return c.json({ error: message }, 500)
  }
})

// ─── POST /api/cdk/order/:id/finish ──────────────────────────────────────────
// 完成：确认激活结束，将订单标为 completed

app.post('/order/:orderId/finish', async (c) => {
  const orderId = c.req.param('orderId')
  const db = getDb(c.env.DB)

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) {
    return c.json({ error: '订单不存在' }, 404)
  }
  if (order.status !== 'received' && order.status !== 'pending') {
    return c.json({ error: '订单状态不允许执行完成操作' }, 400)
  }
  if (!order.externalOrderId) {
    return c.json({ error: '订单缺少外部 ID' }, 400)
  }

  const providerSlug = await resolveProviderSlug(db, order)
  if (!providerSlug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  try {
    const adapter = getProvider(providerSlug, getApiKey(providerSlug, c.env))
    // 尽力调用 confirmOrder（忽略失败）
    await adapter.confirmOrder(order.externalOrderId).catch((err: unknown) =>
      console.warn(`[finish] confirmOrder failed for order ${orderId}:`, err),
    )

    const now = new Date().toISOString()
    await db
      .update(orders)
      .set({ status: 'completed', completedAt: now })
      .where(eq(orders.id, orderId))

    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '完成操作失败'
    return c.json({ error: message }, 500)
  }
})

export default app
