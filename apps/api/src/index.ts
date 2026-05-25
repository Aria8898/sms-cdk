import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'
import authRoute from './routes/auth'
import providersRoute from './routes/providers'
import servicesRoute from './routes/services'
import cdksRoute from './routes/cdks'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.route('/api/auth', authRoute)
app.route('/api/providers', providersRoute)
app.route('/api/services', servicesRoute)
app.route('/api/cdks', cdksRoute)

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

export default app
