import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { YamasakismsAdapter } from '../adapters/yamasakisms'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

function getAdapter(env: Bindings) {
  const userId = env.YAMASAKISMS_USER_ID
  const userCode = env.YAMASAKISMS_USER_CODE
  const apiKey = env.YAMASAKISMS_API_KEY
  if (!userId || !userCode || !apiKey) {
    throw new Error('yamasakisms 未配置（缺少 USER_ID / USER_CODE / API_KEY）')
  }
  return new YamasakismsAdapter(env.DB, userId, userCode, apiKey)
}

// GET /api/yamasakisms/balance
app.get('/balance', async (c) => {
  try {
    const adapter = getAdapter(c.env)
    const data = await adapter.getBalance()
    return c.json(data)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '查询失败' }, 500)
  }
})

// GET /api/yamasakisms/platform-info
app.get('/platform-info', async (c) => {
  try {
    const adapter = getAdapter(c.env)
    const data = await adapter.getPlatformInfo()
    return c.json({ platforms: data })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : '查询失败' }, 500)
  }
})

export default app
