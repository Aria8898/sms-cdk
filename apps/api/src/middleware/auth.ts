import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import type { Bindings } from '../types'

export const authMiddleware = createMiddleware<{ Bindings: Bindings }>(
  async (c, next) => {
    const auth = c.req.header('Authorization')
    if (!auth?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const token = auth.slice(7)
    try {
      await verify(token, c.env.JWT_SECRET, 'HS256')
      await next()
    } catch {
      return c.json({ error: 'Unauthorized' }, 401)
    }
  }
)
