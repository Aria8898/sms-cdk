import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { getDb, services, serviceCategories, providers, poolStatusCache } from '../db'
import { authMiddleware } from '../middleware/auth'
import { getProvider, getApiKey, SmsBowerAdapter } from '../adapters'
import type { PoolCountryStatus } from '../adapters/types'
import type { Bindings } from '../types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', authMiddleware)

const RANK_ORDER: Record<string, number> = { Gold: 0, Silver: 1, Bronze: 2 }

// ─── SMSBower 辅助函数 ────────────────────────────────────────────────────────

type EnrichedBowerPosition = PoolCountryStatus & { blocked: boolean; qualifies: boolean }

/** 合并同国家 + 同等级 + 同价格的 positions（stock 加总，agentIds 合并去重） */
function mergeBowerPositions(positions: PoolCountryStatus[]): PoolCountryStatus[] {
  const map = new Map<string, PoolCountryStatus>()
  for (const pos of positions) {
    const key = `${pos.shortName.toUpperCase()}|${pos.rank ?? ''}|${pos.price}`
    const existing = map.get(key)
    if (existing) {
      existing.stock += pos.stock
      existing.agentIds = [...new Set([...(existing.agentIds ?? []), ...(pos.agentIds ?? [])])]
    } else {
      map.set(key, { ...pos, agentIds: [...(pos.agentIds ?? [])] })
    }
  }
  return [...map.values()]
}

/** 按唯一国家粒度计算摘要（total / qualified / blocked / topPicks） */
function computeBowerSummary(
  positions: EnrichedBowerPosition[],
): { total: number; qualified: number; blocked: number; topPicks: string[] } {
  type CountryEntry = { name: string; blocked: boolean; hasQualified: boolean; bestQualifiedPrice: number }
  const countryMap = new Map<string, CountryEntry>()

  for (const pos of positions) {
    const iso = pos.shortName.toUpperCase()
    const existing = countryMap.get(iso)
    if (!existing) {
      countryMap.set(iso, {
        name: pos.name,
        blocked: pos.blocked,
        hasQualified: pos.qualifies,
        bestQualifiedPrice: pos.qualifies ? pos.price : Infinity,
      })
    } else {
      existing.hasQualified = existing.hasQualified || pos.qualifies
      if (pos.qualifies && pos.price < existing.bestQualifiedPrice) {
        existing.bestQualifiedPrice = pos.price
      }
    }
  }

  const all = [...countryMap.values()]
  const qualified = all.filter(c => c.hasQualified)
  const topPicks = [...qualified]
    .sort((a, b) => a.bestQualifiedPrice - b.bestQualifiedPrice)
    .slice(0, 3)
    .map(c => c.name)

  return {
    total: countryMap.size,
    qualified: qualified.length,
    blocked: all.filter(c => c.blocked).length,
    topPicks,
  }
}

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
    let rawPositions: PoolCountryStatus[] = []
    // 缓存不存 dataSource，读缓存时默认 internal（需要精确信息可强制刷新）
    let dataSource: 'internal' | 'v3' = 'internal'
    let cachedAt: string | null = null

    // ── 读缓存 ──────────────────────────────────────────────────────────────
    if (!forceRefresh) {
      const [cached] = await db
        .select()
        .from(poolStatusCache)
        .where(eq(poolStatusCache.serviceId, serviceId))
      if (cached) {
        rawPositions = JSON.parse(cached.data) as PoolCountryStatus[]
        cachedAt = cached.cachedAt
      }
    }

    // ── 拉取 API ────────────────────────────────────────────────────────────
    if (rawPositions.length === 0 || forceRefresh) {
      try {
        const adapter = new SmsBowerAdapter(getApiKey('smsbower', c.env))
        ;({ dataSource, positions: rawPositions } = await adapter.getBowerPoolStatus(row.externalServiceId))
      } catch (err) {
        const msg = err instanceof Error ? err.message : '获取号池数据失败'
        return c.json({ error: msg }, 500)
      }

      // 更新缓存
      try {
        const now = new Date().toISOString()
        cachedAt = now
        await db
          .insert(poolStatusCache)
          .values({ serviceId, data: JSON.stringify(rawPositions), cachedAt: now })
          .onConflictDoUpdate({
            target: poolStatusCache.serviceId,
            set: { data: JSON.stringify(rawPositions), cachedAt: now },
          })
      } catch (err) {
        console.warn('[pool] cache write failed:', err)
      }
    }

    // ── 策略参数 ────────────────────────────────────────────────────────────
    const maxPrice: number = row.maxPrice
    const blockedCountries: string[] = JSON.parse(row.blockedCountries ?? '[]')
    const blockedSet = new Set(blockedCountries.map(s => s.toUpperCase()))

    // ── 合并同国家+同等级+同价格的 positions ────────────────────────────────
    const merged = mergeBowerPositions(rawPositions)

    // ── 过滤库存不足 + 标注 blocked / qualifies ──────────────────────────────
    // 符合策略：未屏蔽 + Gold 或 Silver + 价格达标（successRate 永远为 0，跳过此项检查）
    const withStatus: EnrichedBowerPosition[] = merged
      .filter(p => p.stock >= 10)
      .map(p => {
        const blocked = blockedSet.size > 0 && blockedSet.has(p.shortName.toUpperCase())
        const qualifies = !blocked && (p.rank === 'Gold' || p.rank === 'Silver') && p.price <= maxPrice
        return { ...p, blocked, qualifies }
      })

    // ── 排序：非屏蔽（Gold→Silver→Bronze→price↑→stock↓）屏蔽沉底 ──────────
    const sorted = withStatus.sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1
      const ra = RANK_ORDER[a.rank ?? ''] ?? 3
      const rb = RANK_ORDER[b.rank ?? ''] ?? 3
      if (ra !== rb) return ra - rb
      if (a.price !== b.price) return a.price - b.price
      return b.stock - a.stock
    })

    // ── 汇总（唯一国家粒度）────────────────────────────────────────────────
    const summary = computeBowerSummary(withStatus)

    return c.json({
      providerSlug: 'smsbower',
      dataSource,
      cachedAt,
      service: {
        id: row.id,
        name: row.name,
        providerName: row.providerName,
        providerSlug: row.providerSlug,
        maxPrice,
        blockedCountries,
      },
      summary,
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
