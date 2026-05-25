import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { getDb, services, providers, cdks } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

app.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: services.id,
      providerId: services.providerId,
      name: services.name,
      shortName: services.shortName,
      externalServiceId: services.externalServiceId,
      successRateThreshold: services.successRateThreshold,
      maxPrice: services.maxPrice,
      createdAt: services.createdAt,
      providerName: providers.name,
      cdkCount: sql<number>`count(${cdks.id})`.as('cdk_count'),
    })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .leftJoin(cdks, eq(cdks.serviceId, services.id))
    .groupBy(services.id)

  return c.json(rows)
})

app.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    shortName: string
    providerId: string
    externalServiceId: string
    successRateThreshold?: number
    maxPrice?: number
  }>()

  const db = getDb(c.env.DB)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await db.insert(services).values({
    id,
    name: body.name,
    shortName: body.shortName,
    providerId: body.providerId,
    externalServiceId: body.externalServiceId,
    successRateThreshold: body.successRateThreshold ?? 70,
    maxPrice: body.maxPrice ?? 0.5,
    createdAt,
  })

  const [created] = await db.select().from(services).where(eq(services.id, id))

  return c.json(created, 201)
})

app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    successRateThreshold?: number
    maxPrice?: number
  }>()

  const db = getDb(c.env.DB)

  const updates: Partial<{ successRateThreshold: number; maxPrice: number }> = {}
  if (body.successRateThreshold !== undefined) updates.successRateThreshold = body.successRateThreshold
  if (body.maxPrice !== undefined) updates.maxPrice = body.maxPrice

  await db.update(services).set(updates).where(eq(services.id, id))

  const [updated] = await db.select().from(services).where(eq(services.id, id))

  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const [cdkRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(cdks)
    .where(eq(cdks.serviceId, id))

  if (cdkRow.count > 0) {
    return c.json({ error: '请先删除该 Service 下的所有 CDK' }, 400)
  }

  await db.delete(services).where(eq(services.id, id))

  return c.json({ success: true })
})

export default app
