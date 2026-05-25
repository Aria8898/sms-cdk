import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()

  if (username !== c.env.ADMIN_USERNAME || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await sign(
    { username, exp: Math.floor(Date.now() / 1000) + 86400 },
    c.env.JWT_SECRET,
    'HS256'
  )

  return c.json({ token })
})

export default app
