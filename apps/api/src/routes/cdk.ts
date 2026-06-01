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
  rateLimits,
  auditLogs,
} from '../db'
import { getProvider, getApiKey, getBoundProvider } from '../adapters'
import type { PoolCountryStatus } from '../adapters/types'
import type { Bindings, Variables } from '../types'
import { log, writeAuditLog } from '../lib/logger'

// ─── Bound CDK 工具函数 ───────────────────────────────────────────────────────

/**
 * 计算 bound CDK 的到期时间：取号当日 +1 日 07:00:00 (UTC+8)
 * 取号时间必须在 08:00–23:59 (UTC+8)，否则返回 null 表示拒绝取号。
 */
function calcBoundExpiresAt(nowUtc: Date): { expiresAt: string } | null {
  // 转换为北京时间（UTC+8）
  const bjOffset = 8 * 60 * 60 * 1000
  const bjNow = new Date(nowUtc.getTime() + bjOffset)
  const bjHour = bjNow.getUTCHours()

  // 00:00–07:59 拒绝取号
  if (bjHour < 8) return null

  // 次日 07:00:00 (UTC+8) = 次日 UTC 23:00:00
  const bjDate = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate()))
  const nextDay07BJ = new Date(bjDate.getTime() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000)
  // 转回 UTC
  const expiresAt = new Date(nextDay07BJ.getTime() - bjOffset).toISOString()
  return { expiresAt }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

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

// ─── 公共：过期订单清理（处理 CDK 状态，适用于 timed 型）────────────────────

async function expireOrder(
  db: ReturnType<typeof getDb>,
  orderId: string,
  orderStatus: string,
  cdkId: string,
  cdkType: string,
  now: string,
): Promise<void> {
  if (cdkType === 'timed') {
    if (orderStatus === 'received') {
      // received 状态到期 → CDK 已激活，标为 exhausted
      await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, cdkId))
    }
    // pending 状态到期 → 未激活，CDK 回到 active（不需要修改，active 未被更改）
  }
  await db
    .update(orders)
    .set({ status: 'expired', completedAt: now })
    .where(eq(orders.id, orderId))
}

// ─── D1 持久化限流（固定窗口，原子 UPSERT，多节点安全）────────────────────────

/**
 * 使用 D1 原子 UPSERT 实现固定窗口限流。
 * 每个 IP 仅一行，无存储增长，不需要 Cron 清理。
 * 存在边界突发（最多 2× 限制量），对 CDK 枚举防护可接受。
 * @returns true 表示允许请求，false 表示超出限制
 */
async function checkValidateRateLimit(
  db: ReturnType<typeof getDb>,
  ip: string,
  max: number,
): Promise<boolean> {
  try {
    const key = `validate:${ip}`
    await db.run(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${key}, 1, datetime('now'))
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
    const [row] = await db
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
    return (row?.count ?? 1) <= max
  } catch (err) {
    // rate_limits 表不存在（migration 未 apply）时 fail-open，不阻断正常请求
    console.warn('[rate-limit] D1 query failed, failing open:', err)
    return true
  }
}

// ─── CAS 落败后 re-read 当前订单状态 ─────────────────────────────────────────────

interface OrderState {
  status: string
  smsContent?: string | null
  verificationCode?: string | null
  canRetry?: boolean
}

async function reReadOrderState(
  db: ReturnType<typeof getDb>,
  orderId: string,
  cdkId: string,
  expiresAt: string | null,
  nowStr: string,
): Promise<OrderState> {
  const [cur] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!cur) return { status: 'cancelled' }

  if (cur.status === 'completed') {
    return { status: 'completed', smsContent: cur.smsContent, verificationCode: cur.verificationCode }
  }
  if (cur.status === 'expired' || cur.status === 'cancelled') {
    return { status: cur.status }
  }
  if (cur.status === 'received') {
    const [cdk] = await db
      .select({ remainingUses: cdks.remainingUses, cdkType: cdks.cdkType })
      .from(cdks).where(eq(cdks.id, cdkId))
    const [latestSms] = await db.select().from(orderSms)
      .where(eq(orderSms.orderId, orderId))
      .orderBy(sql`${orderSms.receivedAt} DESC`).limit(1)
    const canRetry = cdk?.cdkType === 'timed'
      ? (!!expiresAt && expiresAt > nowStr)
      : (cdk?.remainingUses ?? 0) > 0
    return {
      status: 'received',
      smsContent: latestSms?.smsContent ?? cur.smsContent,
      verificationCode: latestSms?.verificationCode ?? cur.verificationCode,
      canRetry,
    }
  }
  return { status: cur.status }
}

// ─── POST /api/cdk/validate ───────────────────────────────────────────────────

app.post('/validate', async (c) => {
  const requestId = c.get('requestId')
  // IP 限频（D1 持久化，多节点安全）
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
  const rateMax = parseInt(c.env.RATE_LIMIT_VALIDATE ?? '10', 10)
  const db = getDb(c.env.DB)

  const allowed = await checkValidateRateLimit(db, ip, rateMax)
  if (!allowed) {
    log('validate.rate_limited', { requestId, ip })
    return c.json({ error: '请求过于频繁，请稍后重试' }, 429)
  }

  const body = await c.req.json<{ code: string }>()

  const [row] = await db
    .select({
      id: cdks.id,
      code: cdks.code,
      status: cdks.status,
      remainingUses: cdks.remainingUses,
      totalUses: cdks.totalUses,
      countryCode: cdks.countryCode,
      categoryId: cdks.categoryId,
      serviceId: cdks.serviceId,
      cdkType: cdks.cdkType,
      validityMinutes: cdks.validityMinutes,
      serviceName: sql<string>`COALESCE(${serviceCategories.name}, ${services.name})`.as('service_name'),
    })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))
    .leftJoin(serviceCategories, eq(serviceCategories.id, cdks.categoryId))
    .where(eq(cdks.code, body.code))

  // 统一错误信息：不区分"不存在"和"已失效"，防止枚举攻击
  if (!row) {
    return c.json({ error: 'CDK 不存在或已失效' }, 404)
  }

  if (row.status === 'disabled') {
    return c.json({ error: 'CDK 不存在或已失效' }, 404)
  }

  // ── 号码绑定型（bound）特殊处理 ─────────────────────────────────────────────
  if (row.cdkType === 'bound') {
    await writeAuditLog(db, 'cdk.validated', 'cdk', row.id, { requestId, ip })

    // bound CDK 已耗尽（已取号）→ 查关联订单
    if (row.status === 'exhausted') {
      const [boundOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.cdkId, row.id))
        .orderBy(sql`${orders.createdAt} DESC`)
        .limit(1)

      const nowIso = new Date().toISOString()

      if (!boundOrder) {
        return c.json({ error: 'CDK 已使用但未找到关联订单' }, 400)
      }

      // 已过期
      if (boundOrder.status === 'expired' || (boundOrder.expiresAt && boundOrder.expiresAt < nowIso)) {
        // 若 DB 状态未更新，顺手标记
        if (boundOrder.status !== 'expired') {
          await db.update(orders).set({ status: 'expired', completedAt: nowIso }).where(eq(orders.id, boundOrder.id))
        }
        return c.json({
          error: '号码已过期，无法继续接收验证码',
          expiredAt: boundOrder.expiresAt,
          boundAt: boundOrder.orderedAt ?? boundOrder.createdAt,
        }, 400)
      }

      // 仍有效
      const selfBase = c.env.SELF_BASE_URL ?? 'https://sms.985008.xyz'
      return c.json({
        cdkId: row.id,
        cdkType: 'bound',
        activeOrder: {
          orderId: boundOrder.id,
          phoneNumber: boundOrder.phoneNumber,
          codeApiUrl: `${selfBase}/api/${row.code}`,
          expiresAt: boundOrder.expiresAt,
          boundAt: boundOrder.orderedAt ?? boundOrder.createdAt,
        },
      })
    }

    // bound CDK 尚未取号（status=active）→ 直接返回可取号状态，不需要号池信息
    return c.json({
      cdkId: row.id,
      service: { name: row.serviceName },
      cdkType: 'bound',
      remaining: null,
      total: null,
      pools: [],
    })
  }
  // ── end bound 处理 ─────────────────────────────────────────────────────────

  // 时效型 CDK 已耗尽：返回过期信息
  if (row.status === 'exhausted' && row.cdkType === 'timed') {
    const [lastOrder] = await db
      .select({ expiresAt: orders.expiresAt, orderedAt: orders.orderedAt, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.cdkId, row.id))
      .orderBy(sql`${orders.createdAt} DESC`)
      .limit(1)
    return c.json({
      error: 'CDK 已过期',
      expiresAt: lastOrder?.expiresAt ?? null,
      lastOrderedAt: lastOrder?.orderedAt ?? lastOrder?.createdAt ?? null,
    }, 400)
  }

  // 按次型 CDK 次数用完
  if (row.cdkType !== 'timed' && (row.remainingUses === 0 || row.status === 'exhausted')) {
    return c.json({ error: 'CDK 次数已用完' }, 400)
  }

  const now = new Date().toISOString()

  // 检查进行中订单（pending / received）
  const activeOrders = await db
    .select({ id: orders.id, expiresAt: orders.expiresAt, status: orders.status })
    .from(orders)
    .where(and(
      eq(orders.cdkId, row.id),
      or(eq(orders.status, 'pending'), eq(orders.status, 'received')),
    ))

  // 过期订单清理
  const expiredOrders = activeOrders.filter(o => o.expiresAt && o.expiresAt < now)
  for (const eo of expiredOrders) {
    await expireOrder(db, eo.id, eo.status, row.id, row.cdkType, now)
  }

  const stillActive = activeOrders.filter(o => !expiredOrders.some(e => e.id === o.id))

  // 并发查询各运营商号池缓存（无论有无进行中订单都查，返回供前端显示）
  const serviceMetas = await getServiceMetas(db, { categoryId: row.categoryId, serviceId: row.serviceId })
  const pools = await Promise.all(
    serviceMetas.map(svc => resolvePoolEntry(db, svc, c.env, row.countryCode ?? undefined)),
  )

  const baseResponse = {
    cdkId: row.id,
    service: { name: row.serviceName },
    cdkType: row.cdkType,
    remaining: row.cdkType === 'timed' ? null : row.remainingUses,
    total: row.cdkType === 'timed' ? null : row.totalUses,
    countryCode: row.countryCode ?? undefined,
    pools,
  }

  // 有进行中的订单 → 会话恢复（count 和 timed 均支持）
  if (stillActive.length > 0) {
    const activeOrderId = stillActive[0].id
    const [activeOrder] = await db.select().from(orders).where(eq(orders.id, activeOrderId))

    if (!activeOrder) {
      await writeAuditLog(db, 'cdk.validated', 'cdk', row.id, { requestId, ip })
      return c.json(baseResponse)
    }

    // 已收到短信则附带最新短信
    let smsContent: string | null = null
    let verificationCode: string | null = null
    if (activeOrder.status === 'received') {
      const [latestSms] = await db
        .select()
        .from(orderSms)
        .where(eq(orderSms.orderId, activeOrderId))
        .orderBy(sql`${orderSms.receivedAt} DESC`)
        .limit(1)
      smsContent = latestSms?.smsContent ?? activeOrder.smsContent
      verificationCode = latestSms?.verificationCode ?? activeOrder.verificationCode
    }

    // canRetry：timed 看有效期，count 看剩余次数
    const canRetry =
      row.cdkType === 'timed'
        ? !!activeOrder.expiresAt && activeOrder.expiresAt > now
        : row.remainingUses > 0

    await writeAuditLog(db, 'cdk.validated', 'cdk', row.id, { requestId, ip, resumedOrderId: activeOrderId })
    return c.json({
      ...baseResponse,
      activeOrder: {
        orderId: activeOrder.id,
        status: activeOrder.status,
        phoneNumber: activeOrder.phoneNumber,
        expiresAt: activeOrder.expiresAt,
        smsContent,
        verificationCode,
        canRetry,
        changeCount: activeOrder.changeCount,
        orderedAt: activeOrder.orderedAt,
      },
    })
  }

  await writeAuditLog(db, 'cdk.validated', 'cdk', row.id, { requestId, ip })
  return c.json(baseResponse)
})

// ─── POST /api/cdk/order ─────────────────────────────────────────────────────

app.post('/order', async (c) => {
  const requestId = c.get('requestId')
  const body = await c.req.json<{ cdkId: string; serviceId?: string; fromOrderId?: string }>()
  const db = getDb(c.env.DB)

  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'

  const [cdkRow] = await db
    .select({
      cdkId: cdks.id,
      code: cdks.code,
      cdkStatus: cdks.status,
      remainingUses: cdks.remainingUses,
      categoryId: cdks.categoryId,
      serviceId: cdks.serviceId,
      countryCode: cdks.countryCode,
      cdkType: cdks.cdkType,
      validityMinutes: cdks.validityMinutes,
    })
    .from(cdks)
    .where(eq(cdks.id, body.cdkId))

  if (!cdkRow) {
    return c.json({ error: 'CDK 不存在或已失效' }, 404)
  }

  if (cdkRow.cdkStatus === 'disabled') {
    return c.json({ error: 'CDK 已停用' }, 400)
  }

  // ── 号码绑定型（bound）取号流程 ────────────────────────────────────────────
  if (cdkRow.cdkType === 'bound') {
    if (cdkRow.cdkStatus === 'exhausted') {
      return c.json({ error: 'CDK 已取号，不可重复取号' }, 400)
    }

    // 取号时间检查（北京时间 08:00–23:59）
    const nowDate = new Date()
    const expiresResult = calcBoundExpiresAt(nowDate)
    if (!expiresResult) {
      return c.json({ error: '08:00 前不开放取号，请 08:00 后再来取号' }, 400)
    }

    // 解析 service（用于获取 providerSlug 和 externalServiceId = yamasakisms platform_id）
    const [boundService] = await db
      .select({
        id: services.id,
        externalServiceId: services.externalServiceId,
        providerSlug: providers.slug,
      })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .where(cdkRow.categoryId
        ? and(eq(services.categoryId, cdkRow.categoryId), eq(services.isDefault, true))
        : eq(services.id, cdkRow.serviceId))
      .limit(1)

    // 若无 isDefault，回退到第一条
    const [effectiveService] = boundService
      ? [boundService]
      : await db
          .select({
            id: services.id,
            externalServiceId: services.externalServiceId,
            providerSlug: providers.slug,
          })
          .from(services)
          .leftJoin(providers, eq(providers.id, services.providerId))
          .where(cdkRow.categoryId
            ? eq(services.categoryId, cdkRow.categoryId)
            : eq(services.id, cdkRow.serviceId))
          .limit(1)

    if (!effectiveService?.providerSlug || !effectiveService.externalServiceId) {
      return c.json({ error: '找不到可用的服务提供商，请联系管理员' }, 500)
    }

    const nowIso = nowDate.toISOString()
    const orderId = crypto.randomUUID()

    // 原子 INSERT：防止 CDK 并发双取
    const insertRes = await c.env.DB.prepare(`
      INSERT INTO orders (id, cdk_id, service_id, status, created_at, ordered_at, ip_address)
      SELECT ?, ?, ?, 'active', ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM orders WHERE cdk_id = ? AND status = 'active'
      )
    `).bind(
      orderId, cdkRow.cdkId, effectiveService.id, nowIso, nowIso, ip,
      cdkRow.cdkId,
    ).run()

    if (insertRes.meta.changes === 0) {
      return c.json({ error: 'CDK 已取号或存在进行中的绑定订单' }, 400)
    }

    try {
      const adapter = getBoundProvider(effectiveService.providerSlug, c.env, c.env.DB)
      const { orderNo, phoneNumber } = await adapter.takeNumber(effectiveService.externalServiceId)

      const { expiresAt } = expiresResult
      await db
        .update(orders)
        .set({ externalOrderId: orderNo, phoneNumber, expiresAt })
        .where(eq(orders.id, orderId))

      // 标记 CDK 为 exhausted
      await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, cdkRow.cdkId))

      await writeAuditLog(db, 'order.created', 'order', orderId, {
        requestId, cdkId: cdkRow.cdkId, serviceId: effectiveService.id, ip, cdkType: 'bound',
      })
      await writeAuditLog(db, 'cdk.exhausted', 'cdk', cdkRow.cdkId, { requestId, orderId, trigger: 'bound.takeNumber' })

      const selfBase = c.env.SELF_BASE_URL ?? 'https://sms.985008.xyz'

      return c.json({
        orderId,
        phoneNumber,
        codeApiUrl: `${selfBase}/api/${cdkRow.code}`,
        expiresAt,
        boundAt: nowIso,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '取号失败，请稍后重试'
      await db
        .update(orders)
        .set({ status: 'cancelled', errorMessage: message, completedAt: nowIso })
        .where(eq(orders.id, orderId))
      return c.json({ error: message }, 400)
    }
  }
  // ── end bound 处理 ─────────────────────────────────────────────────────────

  if (cdkRow.cdkType !== 'timed' && (cdkRow.remainingUses === 0 || cdkRow.cdkStatus === 'exhausted')) {
    return c.json({ error: 'CDK 次数已用完' }, 400)
  }

  if (cdkRow.cdkType === 'timed' && cdkRow.cdkStatus === 'exhausted') {
    return c.json({ error: 'CDK 已过期，无法继续使用' }, 400)
  }

  const checkNow = new Date().toISOString()
  const activeOrders2 = await db
    .select({ id: orders.id, expiresAt: orders.expiresAt, status: orders.status })
    .from(orders)
    .where(and(
      eq(orders.cdkId, body.cdkId),
      or(eq(orders.status, 'pending'), eq(orders.status, 'received')),
    ))

  const expiredOrders2 = activeOrders2.filter(o => o.expiresAt && o.expiresAt < checkNow)
  for (const eo of expiredOrders2) {
    await expireOrder(db, eo.id, eo.status, body.cdkId, cdkRow.cdkType, checkNow)
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

  // 原子条件 INSERT：仅当该 CDK 没有 pending/received 活跃订单时才插入
  // 防止并发请求双双通过前面的检查，导致重复取号
  const orderId = crypto.randomUUID()
  const now = new Date().toISOString()

  const insertResult = await c.env.DB.prepare(`
    INSERT INTO orders (id, cdk_id, service_id, status, created_at, from_order_id, ip_address)
    SELECT ?, ?, ?, 'pending', ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM orders
      WHERE cdk_id = ?
        AND status IN ('pending', 'received')
        AND (expires_at IS NULL OR expires_at > ?)
    )
  `).bind(
    orderId, body.cdkId, serviceRow.id, now, body.fromOrderId ?? null, ip,
    body.cdkId, now,
  ).run()

  if (insertResult.meta.changes === 0) {
    return c.json({ error: 'CDK 正在使用中，请等待当前流程完成' }, 400)
  }

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

    // timed CDK：有效期从取号时刻重新计算；count CDK：使用运营商返回的 expiresIn
    const expiresAt = cdkRow.cdkType === 'timed' && cdkRow.validityMinutes
      ? new Date(Date.now() + cdkRow.validityMinutes * 60_000).toISOString()
      : new Date(Date.now() + result.expiresIn * 1000).toISOString()

    await db
      .update(orders)
      .set({ externalOrderId: result.orderId, phoneNumber: result.phoneNumber, expiresAt, orderedAt: now })
      .where(eq(orders.id, orderId))

    log('order.created', { requestId, orderId, cdkId: body.cdkId, serviceId: serviceRow.id, ip })
    await writeAuditLog(db, 'order.created', 'order', orderId, { requestId, cdkId: body.cdkId, serviceId: serviceRow.id, ip })

    return c.json({ orderId, phoneNumber: result.phoneNumber, expiresIn: result.expiresIn, expiresAt, changeCount: 0, orderedAt: now })
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取号码失败，请稍后重试'
    await db
      .update(orders)
      .set({ status: 'cancelled', errorMessage: message, completedAt: now })
      .where(eq(orders.id, orderId))

    return c.json({ error: message }, 400)
  }
})

// ─── GET /api/cdk/order/:orderId/status ──────────────────────────────────────

app.get('/order/:orderId/status', async (c) => {
  const requestId = c.get('requestId')
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

  const nowStr = new Date().toISOString()

  // 已处于 received 状态
  if (order.status === 'received') {
    const [cdkData] = await db
      .select({ remainingUses: cdks.remainingUses, cdkType: cdks.cdkType })
      .from(cdks)
      .where(eq(cdks.id, order.cdkId))

    // timed CDK：检查本地过期
    if (cdkData?.cdkType === 'timed') {
      if (order.expiresAt && order.expiresAt < nowStr) {
        // received 状态到期 → CDK exhausted
        await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, order.cdkId))
        await db.update(orders).set({ status: 'expired', completedAt: nowStr }).where(eq(orders.id, orderId))
        return c.json({ status: 'expired' })
      }
    }

    const [latestSms] = await db
      .select()
      .from(orderSms)
      .where(eq(orderSms.orderId, orderId))
      .orderBy(sql`${orderSms.receivedAt} DESC`)
      .limit(1)

    const canRetry = cdkData?.cdkType === 'timed'
      ? (!!order.expiresAt && order.expiresAt > nowStr)
      : (cdkData?.remainingUses ?? 0) > 0

    return c.json({
      status: 'received',
      smsContent: latestSms?.smsContent ?? order.smsContent ?? '',
      verificationCode: latestSms?.verificationCode ?? order.verificationCode ?? '',
      canRetry,
    })
  }

  // pending 状态：先检查本地过期（避免 timed CDK 依赖运营商侧的过期）
  if (order.expiresAt && order.expiresAt < nowStr) {
    const [cdkData] = await db
      .select({ cdkType: cdks.cdkType })
      .from(cdks)
      .where(eq(cdks.id, order.cdkId))

    if (cdkData?.cdkType === 'timed') {
      // pending 到期（0 条短信）→ CDK 回到 active，尽力取消上游号码
      if (order.externalOrderId) {
        const providerSlug = await resolveProviderSlug(db, order)
        if (providerSlug) {
          const adapter = getProvider(providerSlug, getApiKey(providerSlug, c.env))
          await adapter.cancelOrder(order.externalOrderId).catch(() => {})
        }
      }
      // CDK 状态不变（仍为 active）
    }

    await db.update(orders).set({ status: 'expired', completedAt: nowStr }).where(eq(orders.id, orderId))
    return c.json({ status: 'expired' })
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

    // 收到短信（received）
    if (pollResult.status === 'received') {
      // CAS：只有仍为 pending 的一方才能推进，防并发重复扣减
      const casReceived = await c.env.DB.prepare(
        `UPDATE orders SET status = 'received', sms_content = ?, verification_code = ?
         WHERE id = ? AND status = 'pending'`,
      ).bind(pollResult.smsContent ?? null, pollResult.verificationCode ?? null, orderId).run()

      if (casReceived.meta.changes === 0) {
        // 落败方：从 DB 读取真实当前状态返回
        return c.json(await reReadOrderState(db, orderId, order.cdkId, order.expiresAt, now))
      }

      // CAS 成功：写 order_sms，扣减 CDK
      await db.insert(orderSms).values({
        id: crypto.randomUUID(),
        orderId,
        smsContent: pollResult.smsContent ?? '',
        verificationCode: pollResult.verificationCode ?? '',
        receivedAt: now,
      })

      const [cdk] = await db.select().from(cdks).where(eq(cdks.id, order.cdkId))
      let canRetry: boolean

      if (cdk?.cdkType === 'timed') {
        canRetry = !!order.expiresAt && order.expiresAt > now
      } else {
        let newRemaining = cdk?.remainingUses ?? 0
        if (cdk) {
          newRemaining = Math.max(0, cdk.remainingUses - 1)
          await db
            .update(cdks)
            .set({ remainingUses: newRemaining, status: newRemaining === 0 ? 'exhausted' : cdk.status })
            .where(eq(cdks.id, order.cdkId))
          if (newRemaining === 0) {
            await writeAuditLog(db, 'cdk.exhausted', 'cdk', order.cdkId, { requestId, orderId, trigger: 'received' })
          }
        }
        canRetry = newRemaining > 0
      }

      await writeAuditLog(db, 'order.status_changed', 'order', orderId, { requestId, from: 'pending', to: 'received' })
      return c.json({
        status: 'received',
        smsContent: pollResult.smsContent,
        verificationCode: pollResult.verificationCode,
        canRetry,
      })
    }

    if (pollResult.status === 'completed') {
      // CAS：同上，只有仍为 pending 的一方才扣减
      const casCompleted = await c.env.DB.prepare(
        `UPDATE orders SET status = 'completed', sms_content = ?, verification_code = ?, completed_at = ?
         WHERE id = ? AND status = 'pending'`,
      ).bind(pollResult.smsContent ?? null, pollResult.verificationCode ?? null, now, orderId).run()

      if (casCompleted.meta.changes === 0) {
        // 落败方：从 DB 读取真实当前状态返回
        return c.json(await reReadOrderState(db, orderId, order.cdkId, order.expiresAt, now))
      }

      // CAS 成功：按次型 CDK 扣减
      const [cdk] = await db.select().from(cdks).where(eq(cdks.id, order.cdkId))
      if (cdk && cdk.cdkType !== 'timed') {
        const newRemaining = Math.max(0, cdk.remainingUses - 1)
        await db
          .update(cdks)
          .set({ remainingUses: newRemaining, status: newRemaining === 0 ? 'exhausted' : cdk.status })
          .where(eq(cdks.id, order.cdkId))
        if (newRemaining === 0) {
          await writeAuditLog(db, 'cdk.exhausted', 'cdk', order.cdkId, { requestId, orderId, trigger: 'completed' })
        }
      }

      await writeAuditLog(db, 'order.status_changed', 'order', orderId, { requestId, from: 'pending', to: 'completed' })
      return c.json({
        status: 'completed',
        smsContent: pollResult.smsContent,
        verificationCode: pollResult.verificationCode,
      })
    }

    if (pollResult.status === 'expired') {
      // 区分 timed 型两种路径
      const [cdk] = await db.select({ cdkType: cdks.cdkType }).from(cdks).where(eq(cdks.id, order.cdkId))

      if (cdk?.cdkType === 'timed') {
        const [smsCount] = await db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(orderSms)
          .where(eq(orderSms.orderId, orderId))
        // pending 到期 0 条 → active（不变），received 到期 ≥1 条 → exhausted
        if ((smsCount?.count ?? 0) > 0) {
          await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, order.cdkId))
        }
      }

      await db
        .update(orders)
        .set({ status: 'expired', completedAt: now })
        .where(eq(orders.id, orderId))
      return c.json({ status: 'expired' })
    }

    if (pollResult.status === 'cancelled') {
      await db
        .update(orders)
        .set({ status: 'cancelled', completedAt: now })
        .where(eq(orders.id, orderId))
      return c.json({ status: 'cancelled' })
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

  const [cdk] = await db
    .select({ remainingUses: cdks.remainingUses, cdkType: cdks.cdkType })
    .from(cdks)
    .where(eq(cdks.id, order.cdkId))

  if (cdk?.cdkType === 'timed') {
    // 时效型：检查有效期
    const now = new Date().toISOString()
    if (order.expiresAt && order.expiresAt < now) {
      return c.json({ error: 'CDK 有效期已到，无法再发' }, 400)
    }
  } else {
    // 按次型：检查剩余次数
    if (!cdk || cdk.remainingUses <= 0) {
      return c.json({ error: 'CDK 次数已用完，无法再发' }, 400)
    }
  }

  const providerSlug = await resolveProviderSlug(db, order)
  if (!providerSlug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  try {
    const adapter = getProvider(providerSlug, getApiKey(providerSlug, c.env))
    await adapter.retryOrder(order.externalOrderId)

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
    await adapter.confirmOrder(order.externalOrderId)

    const now = new Date().toISOString()
    await db
      .update(orders)
      .set({ status: 'completed', completedAt: now })
      .where(eq(orders.id, orderId))

    // 时效型 CDK：手动完成 → 标为 exhausted
    const [cdk] = await db
      .select({ cdkType: cdks.cdkType })
      .from(cdks)
      .where(eq(cdks.id, order.cdkId))
    if (cdk?.cdkType === 'timed') {
      await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, order.cdkId))
    }

    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '完成操作失败'
    return c.json({ error: message }, 500)
  }
})

// ─── POST /api/cdk/order/:id/cancel ──────────────────────────────────────────
// 取消取号：通知上游取消，订单状态变为 cancelled

app.post('/order/:orderId/cancel', async (c) => {
  const requestId = c.get('requestId')
  const orderId = c.req.param('orderId')
  const db = getDb(c.env.DB)

  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }))
  const cancelledReason = body.reason ?? 'user_cancelled'

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) {
    return c.json({ error: '订单不存在' }, 404)
  }
  if (order.status !== 'pending') {
    return c.json({ error: '只有等待中的订单才可取消' }, 400)
  }
  if (!order.externalOrderId) {
    return c.json({ error: '订单缺少外部 ID' }, 400)
  }

  if (order.orderedAt) {
    const elapsedMs = Date.now() - new Date(order.orderedAt).getTime()
    if (elapsedMs < 2 * 60 * 1000) {
      const secondsLeft = Math.ceil((2 * 60 * 1000 - elapsedMs) / 1000)
      return c.json({ error: `取消需等待 ${secondsLeft} 秒`, secondsLeft }, 400)
    }
  }

  const providerSlug = await resolveProviderSlug(db, order)
  if (!providerSlug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  try {
    const adapter = getProvider(providerSlug, getApiKey(providerSlug, c.env))
    if (cancelledReason === 'user_switched_pool') {
      await adapter.cancelOrder(order.externalOrderId).catch(async (err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.warn(`[cancel] cancelOrder failed for order ${orderId} (switch):`, err)
        await writeAuditLog(db, 'cancel.failed', 'order', orderId, { requestId, provider: providerSlug, error: errMsg, reason: cancelledReason })
      })
    } else {
      await adapter.cancelOrder(order.externalOrderId)
    }

    const now = new Date().toISOString()
    await db
      .update(orders)
      .set({ status: 'cancelled', completedAt: now, cancelledReason })
      .where(eq(orders.id, orderId))

    return c.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '取消失败，请稍后重试'
    return c.json({ error: message }, 500)
  }
})

// ─── POST /api/cdk/order/:id/change ──────────────────────────────────────────
// 换号：取消当前号码，重新取一个号（复用同一订单，changeCount+1）

app.post('/order/:orderId/change', async (c) => {
  const requestId = c.get('requestId')
  const orderId = c.req.param('orderId')
  const db = getDb(c.env.DB)

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) {
    return c.json({ error: '订单不存在' }, 404)
  }
  if (order.status !== 'pending') {
    return c.json({ error: '只有等待中的订单才可换号' }, 400)
  }
  if (!order.externalOrderId) {
    return c.json({ error: '订单缺少外部 ID' }, 400)
  }
  if (order.changeCount >= 2) {
    return c.json({ error: '已达换号上限（最多换号 2 次）' }, 400)
  }

  if (order.orderedAt) {
    const elapsedMs = Date.now() - new Date(order.orderedAt).getTime()
    if (elapsedMs < 2 * 60 * 1000) {
      const secondsLeft = Math.ceil((2 * 60 * 1000 - elapsedMs) / 1000)
      return c.json({ error: `换号需等待 ${secondsLeft} 秒`, secondsLeft }, 400)
    }
  }

  const [serviceRow] = await db
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
    .where(eq(services.id, order.serviceId!))

  if (!serviceRow?.providerSlug) {
    return c.json({ error: '无法确定服务提供商' }, 500)
  }

  const [cdkRow] = await db
    .select({ countryCode: cdks.countryCode, cdkType: cdks.cdkType, validityMinutes: cdks.validityMinutes })
    .from(cdks)
    .where(eq(cdks.id, order.cdkId))

  try {
    const adapter = getProvider(serviceRow.providerSlug, getApiKey(serviceRow.providerSlug, c.env))

    try {
      await adapter.cancelOrder(order.externalOrderId)
    } catch (cancelErr: unknown) {
      const errMsg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr)
      console.warn(`[change] cancelOrder failed for order ${orderId}:`, cancelErr)
      await writeAuditLog(db, 'cancel.failed', 'order', orderId, { requestId, provider: serviceRow.providerSlug, error: errMsg, reason: 'change' })
      throw cancelErr  // 取消失败则中止，不继续购买新号
    }

    const result = await adapter.orderNumber(serviceRow.externalServiceId!, {
      maxPrice: serviceRow.maxPrice!,
      successRateThreshold: serviceRow.successRateThreshold!,
      blockedCountries: JSON.parse(serviceRow.blockedCountries ?? '[]') as string[],
      countryCode: cdkRow?.countryCode ?? undefined,
      officialServiceCode: serviceRow.smsbowerServiceCode ?? undefined,
    })

    const now = new Date().toISOString()

    // timed CDK：换号后 expiresAt 重置
    const expiresAt = cdkRow?.cdkType === 'timed' && cdkRow.validityMinutes
      ? new Date(Date.now() + cdkRow.validityMinutes * 60_000).toISOString()
      : new Date(Date.now() + result.expiresIn * 1000).toISOString()

    const newChangeCount = order.changeCount + 1

    await db
      .update(orders)
      .set({
        externalOrderId: result.orderId,
        phoneNumber: result.phoneNumber,
        expiresAt,
        orderedAt: now,
        changeCount: newChangeCount,
        smsContent: null,
        verificationCode: null,
      })
      .where(eq(orders.id, orderId))

    return c.json({
      phoneNumber: result.phoneNumber,
      expiresIn: result.expiresIn,
      expiresAt,
      changeCount: newChangeCount,
      orderedAt: now,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '换号失败，请稍后重试'
    return c.json({ error: message }, 500)
  }
})

export default app
