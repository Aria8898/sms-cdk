import { Hono } from 'hono'
import { eq, sql, and } from 'drizzle-orm'
import { getDb, cdks, services, orders } from '../db'
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

function generateCdkCode(shortName: string): string {
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
      totalUses: cdks.totalUses,
      remainingUses: cdks.remainingUses,
      status: cdks.status,
      createdAt: cdks.createdAt,
      serviceName: services.name,
      hasPendingOrder: sql<number>`
        CASE WHEN EXISTS (
          SELECT 1 FROM orders WHERE orders.cdk_id = ${cdks.id} AND orders.status = 'pending'
        ) THEN 1 ELSE 0 END
      `.as('has_pending_order'),
    })
    .from(cdks)
    .leftJoin(services, eq(services.id, cdks.serviceId))

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
    serviceId: string
    usesPerCdk: number
    quantity: number
  }>()

  const db = getDb(c.env.DB)

  const [service] = await db.select().from(services).where(eq(services.id, body.serviceId))
  if (!service) {
    return c.json({ error: 'Service not found' }, 400)
  }

  const createdAt = new Date().toISOString()
  const newCdks = []

  for (let i = 0; i < body.quantity; i++) {
    const id = crypto.randomUUID()
    const code = generateCdkCode(service.shortName)
    newCdks.push({
      id,
      code,
      serviceId: body.serviceId,
      totalUses: body.usesPerCdk,
      remainingUses: body.usesPerCdk,
      status: 'active',
      createdAt,
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

  return c.json({ ...cdk, service, orders: cdkOrders })
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
