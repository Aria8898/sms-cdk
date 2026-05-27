import { Hono } from 'hono'
import { eq, sql, and } from 'drizzle-orm'
import { getDb, services, serviceCategories, providers, cdks } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

// GET /api/services
// 返回按 ServiceCategory 分组的视图，每个 category 内嵌 services 数组
app.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const [categoryRows, serviceRows] = await Promise.all([
    db.select().from(serviceCategories).orderBy(serviceCategories.createdAt),
    db
      .select({
        id: services.id,
        providerId: services.providerId,
        providerName: providers.name,
        providerAlias: providers.alias,
        categoryId: services.categoryId,
        isDefault: services.isDefault,
        externalServiceId: services.externalServiceId,
        successRateThreshold: services.successRateThreshold,
        maxPrice: services.maxPrice,
        blockedCountries: services.blockedCountries,
        createdAt: services.createdAt,
        cdkCount: sql<number>`count(${cdks.id})`.as('cdk_count'),
      })
      .from(services)
      .leftJoin(providers, eq(providers.id, services.providerId))
      .leftJoin(cdks, eq(cdks.serviceId, services.id))
      .groupBy(services.id),
  ])

  const parsedServices = serviceRows.map(s => ({
    ...s,
    blockedCountries: JSON.parse(s.blockedCountries ?? '[]') as string[],
  }))

  const grouped = categoryRows.map(cat => ({
    ...cat,
    services: parsedServices.filter(s => s.categoryId === cat.id),
  }))

  return c.json(grouped)
})

// POST /api/services
// 在指定 category 下创建一个运营商实现
app.post('/', async (c) => {
  const body = await c.req.json<{
    categoryId: string
    providerId: string
    externalServiceId: string
    isDefault?: boolean
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
  }>()

  if (!body.categoryId) return c.json({ error: '缺少 categoryId' }, 400)
  if (!body.providerId) return c.json({ error: '缺少 providerId' }, 400)
  if (!body.externalServiceId?.trim()) return c.json({ error: '缺少 externalServiceId' }, 400)

  const db = getDb(c.env.DB)

  const [cat] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, body.categoryId))
  if (!cat) return c.json({ error: '服务类型不存在' }, 404)

  // isDefault 唯一性：同一 category 下只能有一个 default
  if (body.isDefault) {
    await db
      .update(services)
      .set({ isDefault: false })
      .where(and(eq(services.categoryId, body.categoryId), eq(services.isDefault, true)))
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await db.insert(services).values({
    id,
    providerId: body.providerId,
    categoryId: body.categoryId,
    isDefault: body.isDefault ?? false,
    name: cat.name,           // copied from category for CDK code generation fallback
    shortName: cat.shortName,
    externalServiceId: body.externalServiceId.trim(),
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

// PUT /api/services/:id
app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
    isDefault?: boolean
  }>()

  const db = getDb(c.env.DB)

  // isDefault 唯一性
  if (body.isDefault === true) {
    const [svc] = await db.select({ categoryId: services.categoryId }).from(services).where(eq(services.id, id))
    if (svc?.categoryId) {
      await db
        .update(services)
        .set({ isDefault: false })
        .where(and(eq(services.categoryId, svc.categoryId), eq(services.isDefault, true)))
    }
  }

  const updates: Partial<{
    successRateThreshold: number
    maxPrice: number
    blockedCountries: string
    isDefault: boolean
  }> = {}
  if (body.successRateThreshold !== undefined) updates.successRateThreshold = body.successRateThreshold
  if (body.maxPrice !== undefined) updates.maxPrice = body.maxPrice
  if (body.blockedCountries !== undefined) updates.blockedCountries = JSON.stringify(body.blockedCountries)
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault

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
