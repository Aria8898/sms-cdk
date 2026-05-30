import { Hono } from 'hono'
import { eq, sql, and } from 'drizzle-orm'
import { getDb, cdks, services, serviceCategories, orders, orderSms } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

const CDK_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomSegment(len: number): string {
  let result = ''
  const array = new Uint8Array(len)
  crypto.getRandomValues(array)
  for (const byte of array) {
    result += CDK_CHARS[byte % CDK_CHARS.length]
  }
  return result
}

/**
 * CDK 格式：
 *   普通：      {shortName}-XXXX-XXXX-XXXX  (e.g. OP-A3KF-9ZMR-B72X)
 *   国家专属：  {shortName}-{ISO}-XXXX-XXXX  (e.g. OP-US-A3KF-9ZMR)
 */
function generateCdkCode(shortName: string, countryCode?: string): string {
  if (countryCode) {
    return `${shortName}-${countryCode.toUpperCase()}-${randomSegment(4)}-${randomSegment(4)}`
  }
  return `${shortName}-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const statusFilter = c.req.query('status')

  const rows = await db
    .select({
      id: cdks.id,
      code: cdks.code,
      serviceId: cdks.serviceId,
      categoryId: cdks.categoryId,
      countryCode: cdks.countryCode,
      totalUses: cdks.totalUses,
      remainingUses: cdks.remainingUses,
      status: cdks.status,
      createdAt: cdks.createdAt,
      cdkType: cdks.cdkType,
      validityMinutes: cdks.validityMinutes,
      serviceName: sql<string>`COALESCE(${serviceCategories.name}, ${services.name})`.as('service_name'),
      hasPendingOrder: sql<number>`
        CASE WHEN EXISTS (
          SELECT 1 FROM orders WHERE orders.cdk_id = ${cdks.id} AND orders.status = 'pending'
        ) THEN 1 ELSE 0 END
      `.as('has_pending_order'),
    })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))
    .leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))

  const result = rows.map((row) => ({
    ...row,
    hasPendingOrder: row.hasPendingOrder === 1,
  }))

  if (statusFilter === 'pending') {
    return c.json(result.filter((r) => r.hasPendingOrder))
  }

  if (statusFilter) {
    return c.json(result.filter((r) => r.status === statusFilter))
  }

  return c.json(result)
})

app.post('/generate', async (c) => {
  const body = await c.req.json<{
    categoryId: string
    usesPerCdk: number
    quantity: number
    countryCode?: string
    cdkType?: 'count' | 'timed'
    validityMinutes?: number
  }>()

  const db = getDb(c.env.DB)

  // 获取 ServiceCategory 的 shortName
  const [categoryRow] = await db
    .select({ id: serviceCategories.id, shortName: serviceCategories.shortName })
    .from(serviceCategories)
    .where(eq(serviceCategories.id, body.categoryId))

  if (!categoryRow) {
    return c.json({ error: 'ServiceCategory not found' }, 400)
  }

  // 找该 category 的默认 service（用于存入 service_id 保持向下兼容）
  const [defaultService] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.categoryId, body.categoryId), eq(services.isDefault, true)))

  // 若无 isDefault 的 service，取第一条
  const [fallbackService] = defaultService
    ? [defaultService]
    : await db
        .select({ id: services.id })
        .from(services)
        .where(eq(services.categoryId, body.categoryId))
        .limit(1)

  if (!fallbackService) {
    return c.json({ error: '该 ServiceCategory 下没有可用的 Service，无法生成 CDK' }, 400)
  }

  const serviceId = fallbackService.id
  const countryCode = body.countryCode?.trim().toUpperCase() || undefined
  const cdkType = body.cdkType ?? 'count'
  const validityMinutes = cdkType === 'timed' ? (body.validityMinutes ?? 60) : null
  // 时效型 CDK usesPerCdk 无实际意义，统一存 1
  const usesPerCdk = cdkType === 'timed' ? 1 : Math.max(1, body.usesPerCdk ?? 1)

  const createdAt = new Date().toISOString()
  const newCdks = []

  for (let i = 0; i < body.quantity; i++) {
    const id = crypto.randomUUID()
    const code = generateCdkCode(categoryRow.shortName, countryCode)
    newCdks.push({
      id,
      code,
      serviceId,
      categoryId: body.categoryId,
      countryCode: countryCode ?? null,
      totalUses: usesPerCdk,
      remainingUses: usesPerCdk,
      status: 'active',
      createdAt,
      cdkType,
      validityMinutes,
    })
  }

  await db.insert(cdks).values(newCdks)

  return c.json({ cdks: newCdks }, 201)
})

app.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const [cdk] = await db.select().from(cdks).where(eq(cdks.id, id))
  if (!cdk) {
    return c.json({ error: 'CDK not found' }, 404)
  }

  const [service] = await db.select().from(services).where(eq(services.id, cdk.serviceId))

  const cdkOrders = await db.select().from(orders).where(eq(orders.cdkId, id))

  // 为每条订单附加其 order_sms 记录
  const ordersWithSms = await Promise.all(
    cdkOrders.map(async (order) => {
      const smsList = await db
        .select()
        .from(orderSms)
        .where(eq(orderSms.orderId, order.id))
        .orderBy(orderSms.receivedAt)
      return { ...order, smsList }
    }),
  )

  return c.json({ ...cdk, service, orders: ordersWithSms })
})

app.patch('/:id/disable', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(and(eq(orders.cdkId, id), eq(orders.status, 'pending')))

  if (pendingRow.count > 0) {
    return c.json({ error: '当前有进行中的订单，无法停用' }, 400)
  }

  await db.update(cdks).set({ status: 'disabled' }).where(eq(cdks.id, id))

  const [updated] = await db.select().from(cdks).where(eq(cdks.id, id))

  return c.json(updated)
})

app.patch('/:id/enable', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  await db.update(cdks).set({ status: 'active' }).where(eq(cdks.id, id))

  const [updated] = await db.select().from(cdks).where(eq(cdks.id, id))

  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const [orderRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(eq(orders.cdkId, id))

  if (orderRow.count > 0) {
    return c.json({ error: '该 CDK 已有使用记录，无法删除' }, 400)
  }

  await db.delete(cdks).where(eq(cdks.id, id))

  return c.json({ success: true })
})

export default app
