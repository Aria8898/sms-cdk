import { Hono } from 'hono'
import { eq, and, sql } from 'drizzle-orm'
import { getDb, auditLogs } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

/**
 * GET /api/audit-logs
 *
 * 查询参数：
 *   event      — 事件类型（如 'cdk.validated'、'cancel.failed'）
 *   entityType — 'cdk' | 'order'
 *   entityId   — 对应实体 ID（cdkId 或 orderId）
 *   from       — 开始时间（ISO 字符串）
 *   to         — 结束时间（ISO 字符串）
 *   page       — 页码，默认 1
 *   pageSize   — 每页数量，默认 50，最大 200
 */
app.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const eventFilter = c.req.query('event')
  const entityTypeFilter = c.req.query('entityType')
  const entityIdFilter = c.req.query('entityId')
  const fromFilter = c.req.query('from')
  const toFilter = c.req.query('to')
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query('pageSize') ?? '50', 10)))
  const offset = (page - 1) * pageSize

  // 构建 WHERE 条件
  const conditions = []
  if (eventFilter) conditions.push(eq(auditLogs.event, eventFilter))
  if (entityTypeFilter) conditions.push(eq(auditLogs.entityType, entityTypeFilter))
  if (entityIdFilter) conditions.push(eq(auditLogs.entityId, entityIdFilter))
  if (fromFilter) conditions.push(sql`${auditLogs.createdAt} >= ${fromFilter}`)
  if (toFilter) conditions.push(sql`${auditLogs.createdAt} <= ${toFilter}`)

  const where = conditions.length > 0 ? and(...conditions) : undefined

  // 总数
  const [countRow] = await db
    .select({ total: sql<number>`count(*)`.as('total') })
    .from(auditLogs)
    .where(where)

  // 分页查询，按时间倒序
  const rows = await db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(sql`${auditLogs.createdAt} DESC`)
    .limit(pageSize)
    .offset(offset)

  return c.json({
    data: rows.map(r => ({
      ...r,
      meta: r.meta ? JSON.parse(r.meta) : null,
    })),
    total: countRow?.total ?? 0,
    page,
    pageSize,
  })
})

export default app
