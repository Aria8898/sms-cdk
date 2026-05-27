import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'
import authRoute from './routes/auth'
import providersRoute from './routes/providers'
import serviceCategoriesRoute from './routes/service-categories'
import servicesRoute from './routes/services'
import cdksRoute from './routes/cdks'
import cdkRoute from './routes/cdk'
import poolRoute from './routes/pool'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

app.route('/api/auth', authRoute)
app.route('/api/providers', providersRoute)
app.route('/api/service-categories', serviceCategoriesRoute)
app.route('/api/services', servicesRoute)
app.route('/api/cdks', cdksRoute)
app.route('/api/cdk', cdkRoute)
app.route('/api/pool-status', poolRoute)

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

export default app
