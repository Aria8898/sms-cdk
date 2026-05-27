import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { getDb, serviceCategories, services } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

app.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const rows = await db
    .select({
      id: serviceCategories.id,
      name: serviceCategories.name,
      shortName: serviceCategories.shortName,
      createdAt: serviceCategories.createdAt,
      serviceCount: sql<number>`count(${services.id})`.as('service_count'),
    })
    .from(serviceCategories)
    .leftJoin(services, eq(services.categoryId, serviceCategories.id))
    .groupBy(serviceCategories.id)
    .orderBy(serviceCategories.createdAt)

  return c.json(rows)
})

app.post('/', async (c) => {
  const { name, shortName } = await c.req.json<{ name: string; shortName: string }>()

  if (!name?.trim()) return c.json({ error: '名称为必填项' }, 400)
  if (!shortName?.trim()) return c.json({ error: '前缀为必填项' }, 400)

  const db = getDb(c.env.DB)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  await db.insert(serviceCategories).values({
    id,
    name: name.trim(),
    shortName: shortName.trim().toUpperCase(),
    createdAt,
  })

  const [created] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id))
  return c.json(created, 201)
})

app.put('/:id', async (c) => {
  const id = c.req.param('id')
  const { name, shortName } = await c.req.json<{ name?: string; shortName?: string }>()

  const db = getDb(c.env.DB)
  const updates: Partial<{ name: string; shortName: string }> = {}
  if (name !== undefined) updates.name = name.trim()
  if (shortName !== undefined) updates.shortName = shortName.trim().toUpperCase()

  if (Object.keys(updates).length === 0) {
    return c.json({ error: '没有要更新的字段' }, 400)
  }

  await db.update(serviceCategories).set(updates).where(eq(serviceCategories.id, id))

  const [updated] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id))
  if (!updated) return c.json({ error: '服务类型不存在' }, 404)

  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env.DB)

  const [row] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(services)
    .where(eq(services.categoryId, id))

  if (row.count > 0) {
    return c.json({ error: '请先删除该类型下的所有运营商实现' }, 400)
  }

  await db.delete(serviceCategories).where(eq(serviceCategories.id, id))
  return c.json({ success: true })
})

// POST /api/service-categories/migrate
// 一次性迁移：将现有 services 的 name/shortName 提取为 service_categories，并回填 category_id
app.post('/migrate', async (c) => {
  const db = getDb(c.env.DB)

  const uncategorized = await db
    .select()
    .from(services)
    .where(sql`${services.categoryId} IS NULL`)

  if (uncategorized.length === 0) {
    return c.json({ migrated: 0, categories: 0, message: '所有 Service 已有分类，无需迁移' })
  }

  // 按 (name, shortName) 分组
  const groups = new Map<string, { name: string; shortName: string; svcs: typeof uncategorized }>()
  for (const svc of uncategorized) {
    const key = JSON.stringify([svc.name, svc.shortName])
    if (!groups.has(key)) {
      groups.set(key, { name: svc.name, shortName: svc.shortName, svcs: [] })
    }
    groups.get(key)!.svcs.push(svc)
  }

  const now = new Date().toISOString()
  let migratedCount = 0

  for (const { name, shortName, svcs } of groups.values()) {
    const catId = crypto.randomUUID()
    await db.insert(serviceCategories).values({ id: catId, name, shortName, createdAt: now })

    for (let i = 0; i < svcs.length; i++) {
      await db
        .update(services)
        .set({ categoryId: catId, isDefault: i === 0 })
        .where(eq(services.id, svcs[i].id))
    }
    migratedCount += svcs.length
  }

  return c.json({
    migrated: migratedCount,
    categories: groups.size,
    message: `迁移完成：创建了 ${groups.size} 个服务类型，处理了 ${migratedCount} 个运营商实现`,
  })
})

export default app
