import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, services, providers } from '../db'
import { authMiddleware } from '../middleware/auth'
import { getProvider } from '../adapters'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

// GET /api/pool-status?serviceId=xxx
// 查询指定 Service 的号池情况，包含所有国家数据及策略筛选结果
app.get('/', async (c) => {
  const serviceId = c.req.query('serviceId')
  if (!serviceId) {
    return c.json({ error: '缺少 serviceId 参数' }, 400)
  }

  const db = getDb(c.env.DB)

  // 查询 service + provider 信息
  const [row] = await db
    .select({
      id: services.id,
      name: services.name,
      externalServiceId: services.externalServiceId,
      successRateThreshold: services.successRateThreshold,
      maxPrice: services.maxPrice,
      blockedCountries: services.blockedCountries,
      providerSlug: providers.slug,
      providerName: providers.name,
    })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(eq(services.id, serviceId))

  if (!row) {
    return c.json({ error: 'Service 不存在' }, 404)
  }

  const blockedCountries: string[] = JSON.parse(row.blockedCountries ?? '[]')
  const blockedSet = new Set(blockedCountries.map(s => s.toUpperCase()))

  // 通过 adapter 获取号池原始数据
  const provider = getProvider(row.providerSlug!, c.env.SMSPOOL_API_KEY)
  const rawCountries = await provider.getPoolStatus(row.externalServiceId)

  // 应用号选策略，打上屏蔽标签、筛选标签和排名
  type EnrichedCountry = (typeof rawCountries)[number] & {
    blocked: boolean
    qualifies: boolean
    rank: number | null
  }

  const countries: EnrichedCountry[] = rawCountries.map(c => {
    const blocked = blockedSet.size > 0 && blockedSet.has(c.shortName.toUpperCase())
    const qualifies = !blocked && c.successRate >= row.successRateThreshold && c.lowPrice <= row.maxPrice
    return { ...c, blocked, qualifies, rank: null }
  })

  // 对符合策略的国家按 lowPrice 升序排名
  let rank = 1
  countries
    .filter(c => c.qualifies)
    .sort((a, b) => a.lowPrice - b.lowPrice)
    .forEach(c => { c.rank = rank++ })

  const qualified = countries.filter(c => c.qualifies)
  const blockedList = countries.filter(c => c.blocked)
  const topPicks = qualified
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, 3)
    .map(c => c.shortName)

  return c.json({
    service: {
      id: row.id,
      name: row.name,
      providerName: row.providerName,
      successRateThreshold: row.successRateThreshold,
      maxPrice: row.maxPrice,
      blockedCountries,
    },
    summary: {
      total: countries.length,
      qualified: qualified.length,
      blocked: blockedList.length,
      topPicks,
    },
    countries,
  })
})

export default app
