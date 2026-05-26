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
      blockedCountries: services.blockedCountries,
      createdAt: services.createdAt,
      providerName: providers.name,
      cdkCount: sql<number>`count(${cdks.id})`.as('cdk_count'),
    })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .leftJoin(cdks, eq(cdks.serviceId, services.id))
    .groupBy(services.id)

  return c.json(rows.map(row => ({
    ...row,
    blockedCountries: JSON.parse(row.blockedCountries ?? '[]') as string[],
  })))
})

app.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    shortName: string
    providerId: string
    externalServiceId: string
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
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
    blockedCountries: JSON.stringify(body.blockedCountries ?? []),
    createdAt,
  })

  const [created] = await db.select().from(services).where(eq(services.id, id))

  return c.json({
    ...created,
    blockedCountries: JSON.parse(created.blockedCountries ?? '[]') as string[],
  }, 201)
})

app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
  }>()

  const db = getDb(c.env.DB)

  const updates: Partial<{ successRateThreshold: number; maxPrice: number; blockedCountries: string }> = {}
  if (body.successRateThreshold !== undefined) updates.successRateThreshold = body.successRateThreshold
  if (body.maxPrice !== undefined) updates.maxPrice = body.maxPrice
  if (body.blockedCountries !== undefined) updates.blockedCountries = JSON.stringify(body.blockedCountries)

  await db.update(services).set(updates).where(eq(services.id, id))

  const [updated] = await db.select().from(services).where(eq(services.id, id))

  return c.json({
    ...updated,
    blockedCountries: JSON.parse(updated.blockedCountries ?? '[]') as string[],
  })
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
