import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { getDb, services, serviceCategories, providers, poolStatusCache } from '../db'
import { authMiddleware } from '../middleware/auth'
import { getProvider, getApiKey } from '../adapters'
import type { PoolCountryStatus } from '../adapters/types'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

const RANK_ORDER: Record<string, number> = { Gold: 0, Silver: 1, Bronze: 2 }

// GET /api/pool-status?serviceId=xxx[&refresh=true]
app.get('/', async (c) => {
  const serviceId = c.req.query('serviceId')
  if (!serviceId) {
    return c.json({ error: '缺少 serviceId 参数' }, 400)
  }

  const db = getDb(c.env.DB)

  const [row] = await db
    .select({
      id: services.id,
      name: sql<string>`COALESCE(${serviceCategories.name}, ${services.name})`.as('name'),
      externalServiceId: services.externalServiceId,
      successRateThreshold: services.successRateThreshold,
      maxPrice: services.maxPrice,
      blockedCountries: services.blockedCountries,
      providerSlug: providers.slug,
      providerName: providers.name,
    })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(eq(services.id, serviceId))

  if (!row) {
    return c.json({ error: 'Service 不存在' }, 404)
  }

  // ─── SMSBower 分支 ────────────────────────────────────────────────────────

  if (row.providerSlug === 'smsbower') {
    const forceRefresh = c.req.query('refresh') === 'true'
    let positions: PoolCountryStatus[] = []

    if (!forceRefresh) {
      const [cached] = await db
        .select()
        .from(poolStatusCache)
        .where(eq(poolStatusCache.serviceId, serviceId))
      if (cached) {
        positions = JSON.parse(cached.data) as PoolCountryStatus[]
      }
    }

    if (positions.length === 0 || forceRefresh) {
      try {
        const adapter = getProvider(row.providerSlug, getApiKey(row.providerSlug, c.env))
        positions = await adapter.getPoolStatus(row.externalServiceId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : '获取号池数据失败'
        return c.json({ error: msg }, 500)
      }

      // 更新缓存
      try {
        const now = new Date().toISOString()
        await db
          .insert(poolStatusCache)
          .values({ serviceId, data: JSON.stringify(positions), cachedAt: now })
          .onConflictDoUpdate({
            target: poolStatusCache.serviceId,
            set: { data: JSON.stringify(positions), cachedAt: now },
          })
      } catch (err) {
        console.warn('[pool] cache write failed:', err)
      }
    }

    // 排序：Gold → Silver → Bronze → rate↓ → price↑ → stock↓（库存 < 10 不展示）
    const sorted = [...positions].filter(p => p.stock >= 10).sort((a, b) => {
      const ra = RANK_ORDER[a.rank ?? ''] ?? 3
      const rb = RANK_ORDER[b.rank ?? ''] ?? 3
      if (ra !== rb) return ra - rb
      if (b.successRate !== a.successRate) return b.successRate - a.successRate
      if (a.price !== b.price) return a.price - b.price
      return b.stock - a.stock
    })

    return c.json({
      providerSlug: 'smsbower',
      service: {
        id: row.id,
        name: row.name,
        providerName: row.providerName,
        providerSlug: row.providerSlug,
      },
      positions: sorted,
    })
  }

  // ─── SMSPool 分支（保持原有逻辑）─────────────────────────────────────────

  const blockedCountries: string[] = JSON.parse(row.blockedCountries ?? '[]')
  const blockedSet = new Set(blockedCountries.map(s => s.toUpperCase()))

  const provider = getProvider(row.providerSlug!, getApiKey(row.providerSlug!, c.env))
  const rawCountries = await provider.getPoolStatus(row.externalServiceId)

  // 使用 strategyRank 避免与 PoolCountryStatus.rank（字符串等级）冲突
  type EnrichedCountry = Omit<(typeof rawCountries)[number], 'rank'> & {
    rank?: 'Gold' | 'Silver' | 'Bronze'
    blocked: boolean
    qualifies: boolean
    strategyRank: number | null
  }

  const countries: EnrichedCountry[] = rawCountries.map(c => {
    const blocked = blockedSet.size > 0 && blockedSet.has(c.shortName.toUpperCase())
    const qualifies = !blocked && c.successRate >= row.successRateThreshold && c.lowPrice <= row.maxPrice
    return { ...c, blocked, qualifies, strategyRank: null }
  })

  let strategyRankCounter = 1
  countries
    .filter(c => c.qualifies)
    .sort((a, b) => a.lowPrice - b.lowPrice)
    .forEach(c => { c.strategyRank = strategyRankCounter++ })

  const qualified = countries.filter(c => c.qualifies)
  const blockedList = countries.filter(c => c.blocked)
  const topPicks = qualified
    .sort((a, b) => (a.strategyRank ?? 999) - (b.strategyRank ?? 999))
    .slice(0, 3)
    .map(c => c.shortName)

  return c.json({
    providerSlug: 'smspool',
    service: {
      id: row.id,
      name: row.name,
      providerName: row.providerName,
      providerSlug: row.providerSlug,
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
