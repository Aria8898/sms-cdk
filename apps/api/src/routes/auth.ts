import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { eq, and, sql, desc } from 'drizzle-orm'
import { getDb, loginAttempts } from '../db'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

// IP 限频：每分钟最多 5 次；连续失败 ≥ 5 次（15 分钟内无成功）封禁 15 分钟

app.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()
  const db = getDb(c.env.DB)

  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
  const now = new Date().toISOString()
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString()
  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString()

  // ── 每分钟 5 次限频
  const [recentRow] = await db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.ipAddress, ip),
      sql`${loginAttempts.createdAt} > ${oneMinAgo}`,
    ))

  if ((recentRow?.count ?? 0) >= 5) {
    return c.json({ error: '请求过于频繁，请稍后重试' }, 429)
  }

  // ── 连续失败封禁（15 分钟内连续失败 ≥ 5 次，无成功记录打断）
  const recentAttempts = await db
    .select({ success: loginAttempts.success })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.ipAddress, ip),
      sql`${loginAttempts.createdAt} > ${fifteenMinAgo}`,
    ))
    .orderBy(desc(loginAttempts.createdAt))
    .limit(10)

  let consecutiveFails = 0
  for (const a of recentAttempts) {
    if (a.success) break
    consecutiveFails++
  }

  if (consecutiveFails >= 5) {
    return c.json({ error: '登录失败次数过多，请 15 分钟后再试' }, 429)
  }

  const success = username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD

  // ── 写入尝试记录（尽力，忽略失败）
  await db
    .insert(loginAttempts)
    .values({ id: crypto.randomUUID(), ipAddress: ip, success, createdAt: now })
    .catch((err: unknown) => console.warn('[auth] write attempt failed:', err))

  if (!success) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await sign(
    { username, exp: Math.floor(Date.now() / 1000) + 86400 },
    c.env.JWT_SECRET,
    'HS256',
  )

  return c.json({ token })
})

export default app
