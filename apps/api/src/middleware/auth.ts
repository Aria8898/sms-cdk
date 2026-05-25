import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import type { Bindings } from '../types'

export const authMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const auth = c.req.header('Authorization')
    console.log('[auth] Authorization header:', auth ? `Bearer ***${auth.slice(-10)}` : 'MISSING')
    console.log('[auth] JWT_SECRET defined:', !!c.env.JWT_SECRET)

    if (!auth?.startsWith('Bearer ')) {
      console.log('[auth] FAIL: missing or malformed header')
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const token = auth.slice(7)
    try {
      const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
      console.log('[auth] OK: payload =', JSON.stringify(payload))
      await next()
    } catch (err) {
      console.log('[auth] FAIL: verify threw:', err instanceof Error ? err.message : err)
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
)
