import { Hono } from 'hono'
import { eq, sql, and, inArray } from 'drizzle-orm'
import { getDb, cdks, services, serviceCategories, orders, orderSms, providers, auditLogs } from '../db'
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
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query('pageSize') ?? '50', 10)))
  const offset = (page - 1) * pageSize

  // 构建 WHERE 条件
  const conditions = statusFilter && statusFilter !== 'pending'
    ? and(eq(cdks.status, statusFilter))
    : undefined

  // 查总数
  const [countRow] = await db
    .select({ total: sql<number>`count(*)`.as('total') })
    .from(cdks)
    .where(conditions)

  const total = countRow?.total ?? 0

  let query = db
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
    .leftJoin(serviceCategories, eq(serviceCategories.id, cdks.categoryId))

  // 特殊情况：pending 过滤需在结果中判断 hasPendingOrder，但用 SQL EXISTS 已嵌入
  if (statusFilter === 'pending') {
    // 用 SQL WHERE EXISTS 过滤有进行中订单的 CDK
    const pendingRows = await db
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
        hasPendingOrder: sql<number>`1`.as('has_pending_order'),
      })
      .from(cdks)
      .leftJoin(services, eq(services.id, cdks.serviceId))
      .leftJoin(serviceCategories, eq(serviceCategories.id, cdks.categoryId))
      .where(sql`EXISTS (SELECT 1 FROM orders WHERE orders.cdk_id = ${cdks.id} AND orders.status = 'pending')`)
      .limit(pageSize)
      .offset(offset)

    const [pendingCount] = await db
      .select({ total: sql<number>`count(*)`.as('total') })
      .from(cdks)
      .where(sql`EXISTS (SELECT 1 FROM orders WHERE orders.cdk_id = ${cdks.id} AND orders.status = 'pending')`)

    return c.json({
      data: pendingRows.map(r => ({ ...r, hasPendingOrder: true })),
      total: pendingCount?.total ?? 0,
      page,
      pageSize,
    })
  }

  const rows = await (conditions ? query.where(conditions) : query)
    .orderBy(sql`${cdks.createdAt} DESC`)
    .limit(pageSize)
    .offset(offset)

  return c.json({
    data: rows.map(r => ({ ...r, hasPendingOrder: r.hasPendingOrder === 1 })),
    total,
    page,
    pageSize,
  })
})

app.post('/generate', async (c) => {
  const body = await c.req.json<{
    categoryId: string
    usesPerCdk: number
    quantity: number
    countryCode?: string
    cdkType?: 'count' | 'timed' | 'bound'
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
  // 后端强制范围校验：1–10080 分钟（最短 1 分钟，最长 7 天）；bound 类型不使用
  const validityMinutes = cdkType === 'timed'
    ? Math.min(10080, Math.max(1, body.validityMinutes ?? 60))
    : null
  // bound/timed CDK usesPerCdk 无实际意义，统一存 1
  const usesPerCdk = (cdkType === 'timed' || cdkType === 'bound') ? 1 : Math.max(1, body.usesPerCdk ?? 1)

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

// ─── POST /api/cdks/manual-bind — 管理员手动绑定 bound CDK ───────────────────

app.post('/manual-bind', async (c) => {
  const body = await c.req.json<{
    cdkCode: string
    phoneNumber: string
    orderNo: string
  }>()

  if (!body.cdkCode || !body.phoneNumber || !body.orderNo) {
    return c.json({ error: '缺少必要参数：cdkCode / phoneNumber / orderNo' }, 400)
  }

  const db = getDb(c.env.DB)

  const [cdk] = await db.select().from(cdks).where(eq(cdks.code, body.cdkCode))
  if (!cdk) {
    return c.json({ error: 'CDK 不存在' }, 404)
  }
  if (cdk.cdkType !== 'bound') {
    return c.json({ error: '只有号码绑定型 CDK 支持手动绑定' }, 400)
  }
  if (cdk.status !== 'active') {
    return c.json({ error: 'CDK 已使用或已停用，不可手动绑定' }, 400)
  }

  // 计算到期时间：换号当日次日 07:00 (UTC+8)
  const now = new Date()
  const bjOffset = 8 * 60 * 60 * 1000
  const bjNow = new Date(now.getTime() + bjOffset)
  const bjDate = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate()))
  const nextDay07BJ = new Date(bjDate.getTime() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000)
  const expiresAt = new Date(nextDay07BJ.getTime() - bjOffset).toISOString()
  const nowIso = now.toISOString()

  const orderId = crypto.randomUUID()

  await db.insert(orders).values({
    id: orderId,
    cdkId: cdk.id,
    externalOrderId: body.orderNo,
    phoneNumber: body.phoneNumber,
    status: 'active',
    createdAt: nowIso,
    orderedAt: nowIso,
    expiresAt,
    changeCount: 0,
  })

  await db.update(cdks).set({ status: 'exhausted' }).where(eq(cdks.id, cdk.id))

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    event: 'order.created',
    entityType: 'order',
    entityId: orderId,
    meta: JSON.stringify({ cdkCode: body.cdkCode, phoneNumber: body.phoneNumber, orderNo: body.orderNo, operatedBy: 'admin', trigger: 'manual-bind' }),
    createdAt: nowIso,
  })

  return c.json({ orderId, expiresAt }, 201)
})

// ─── POST /api/cdks/orders/:id/rebind — 管理员换号 ───────────────────────────

app.post('/orders/:id/rebind', async (c) => {
  const orderId = c.req.param('id')
  const body = await c.req.json<{
    newPhoneNumber: string
    newOrderNo: string
  }>()

  if (!body.newPhoneNumber || !body.newOrderNo) {
    return c.json({ error: '缺少必要参数：newPhoneNumber / newOrderNo' }, 400)
  }

  const db = getDb(c.env.DB)

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) {
    return c.json({ error: '订单不存在' }, 404)
  }

  const [cdk] = await db.select().from(cdks).where(eq(cdks.id, order.cdkId))
  if (!cdk || cdk.cdkType !== 'bound') {
    return c.json({ error: '只有号码绑定型订单可以换号' }, 400)
  }
  if (order.status !== 'active') {
    return c.json({ error: '只有生效中的订单可以换号' }, 400)
  }

  // 计算新到期时间：换号当日次日 07:00 (UTC+8)
  const now = new Date()
  const bjOffset = 8 * 60 * 60 * 1000
  const bjNow = new Date(now.getTime() + bjOffset)
  const bjDate = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate()))
  const nextDay07BJ = new Date(bjDate.getTime() + 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000)
  const newExpiresAt = new Date(nextDay07BJ.getTime() - bjOffset).toISOString()
  const nowIso = now.toISOString()

  const oldPhoneNumber = order.phoneNumber
  const oldOrderNo = order.externalOrderId

  await db.update(orders).set({
    phoneNumber: body.newPhoneNumber,
    externalOrderId: body.newOrderNo,
    expiresAt: newExpiresAt,
    orderedAt: nowIso,
  }).where(eq(orders.id, orderId))

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    event: 'order.rebound',
    entityType: 'order',
    entityId: orderId,
    meta: JSON.stringify({
      orderId,
      cdkCode: cdk.code,
      oldPhoneNumber,
      newPhoneNumber: body.newPhoneNumber,
      oldOrderNo,
      newOrderNo: body.newOrderNo,
      newExpiresAt,
      operatedBy: 'admin',
    }),
    createdAt: nowIso,
  })

  return c.json({ success: true, newExpiresAt })
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

// POST /api/cdks/batch-disable — 批量作废
app.post('/batch-disable', async (c) => {
  const body = await c.req.json<{ ids: string[] }>()
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: '请提供要作废的 CDK ID 列表' }, 400)
  }
  if (body.ids.length > 200) {
    return c.json({ error: '单次最多批量作废 200 个 CDK' }, 400)
  }

  const db = getDb(c.env.DB)

  // 检查有无进行中订单
  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(orders)
    .where(and(inArray(orders.cdkId, body.ids), eq(orders.status, 'pending')))

  if (pendingRow.count > 0) {
    return c.json({ error: `有 ${pendingRow.count} 个 CDK 存在进行中的订单，无法批量作废` }, 400)
  }

  await db
    .update(cdks)
    .set({ status: 'disabled' })
    .where(and(inArray(cdks.id, body.ids), eq(cdks.status, 'active')))

  return c.json({ success: true, disabled: body.ids.length })
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
