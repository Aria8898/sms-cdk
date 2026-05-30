import { Hono } from 'hono'
import { eq, sql, desc } from 'drizzle-orm'
import { getDb, loginAttempts } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

// GET /api/security/login-attempts?fail=1
app.get('/login-attempts', async (c) => {
  const db = getDb(c.env.DB)
  const failOnly = c.req.query('fail') === '1'

  const rows = failOnly
    ? await db
        .select({
          id: loginAttempts.id,
          ipAddress: loginAttempts.ipAddress,
          success: loginAttempts.success,
          createdAt: loginAttempts.createdAt,
        })
        .from(loginAttempts)
        .where(eq(loginAttempts.success, false))
        .orderBy(desc(loginAttempts.createdAt))
        .limit(500)
    : await db
        .select({
          id: loginAttempts.id,
          ipAddress: loginAttempts.ipAddress,
          success: loginAttempts.success,
          createdAt: loginAttempts.createdAt,
        })
        .from(loginAttempts)
        .orderBy(desc(loginAttempts.createdAt))
        .limit(500)

  // 附带统计信息
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`.as('total'),
      failures: sql<number>`sum(case when success = 0 then 1 else 0 end)`.as('failures'),
    })
    .from(loginAttempts)

  return c.json({ rows, stats: { total: stats?.total ?? 0, failures: stats?.failures ?? 0 } })
})

export default app
