import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { getDb, providers, services } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

app.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: providers.id,
      name: providers.name,
      slug: providers.slug,
      createdAt: providers.createdAt,
      serviceCount: sql<number>`count(${services.id})`.as('service_count'),
    })
    .from(providers)
    .leftJoin(services, eq(services.providerId, providers.id))
    .groupBy(providers.id)

  return c.json(rows)
})

app.post('/', async (c) => {
  const { name, slug } = await c.req.json<{ name: string; slug: string }>()
  const db = getDb(c.env.DB)

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await db.insert(providers).values({ id, name, slug, createdAt })

  const [created] = await db.select().from(providers).where(eq(providers.id, id))

  return c.json(created, 201)
})

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const [serviceRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(services)
    .where(eq(services.providerId, id))

  if (serviceRow.count > 0) {
    return c.json({ error: '请先删除该 Provider 下的所有 Service' }, 400)
  }

  await db.delete(providers).where(eq(providers.id, id))

  return c.json({ success: true })
})

export default app
