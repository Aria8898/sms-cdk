import type { SmsProvider, OrderOptions, OrderResult, PollResult, PoolCountryStatus } from './types'

// ─── SMSBower API ─────────────────────────────────────────────────────────────
// 官方 API: https://smsbower.page/stubs/handler_api.php
// 内部 API: https://smsbower.page/api/  (非公开，格式待调试确认)

const OFFICIAL_BASE = 'https://smsbower.page/stubs/handler_api.php'
const INTERNAL_BASE = 'https://smsbower.app/activations'

// ─── Internal API types ───────────────────────────────────────────────────────

interface InternalPosition {
  price: number
  rank: { id: number; description: string }
  count: number
  agent_ids: number[]
  agent_prices?: Record<string, number>
}

interface InternalCountry {
  id: number
  title: string
  iso: string
  min_price?: number
  count?: number
  positions?: Record<string, InternalPosition>
}

/** getPricesByService 内部 API 实际响应格式
 * services[serviceId].countries[countryId].positions["{rankId}|{price}"]
 */
interface InternalPricesResponse {
  services: Record<string, { countries: Record<string, InternalCountry> }>
}

/** getPricesV3 响应：{ countryKey: { serviceCode: { providerId: V3Entry } } } */
interface V3Entry {
  count: number | string
  price: number | string
  provider_id: number | string
}
type V3Response = Record<string, Record<string, Record<string, V3Entry>>>

// ─── GetNumberV2 response ─────────────────────────────────────────────────────

interface GetNumberV2Response {
  activationId?: number | string
  phoneNumber?: string
  activationCost?: string | number
  countryCode?: string | number
  canGetAnotherSms?: boolean | string | number
  activationTime?: string | number   // 格式待调试：可能是 ISO 日期、Unix 时间戳或秒数
  activationOperator?: string | number
  // 错误时可能直接返回字符串或有 error 字段
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 标题化：usa → USA，russia → Russia */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** 根据交付率计算等级 */
function rateToRank(rate: number): 'Gold' | 'Silver' | 'Bronze' {
  if (rate >= 80) return 'Gold'
  if (rate >= 60) return 'Silver'
  return 'Bronze'
}

/**
 * SMSBower activationTime 是激活创建时间，非到期时间，无法直接计算剩余秒数。
 * 固定返回 20 分钟（SMSBower 标准激活窗口）。
 */
function parseActivationTime(_value: string | number | undefined): number {
  return 1200  // 20 分钟
}

/** ISO 2 字母码 → SMSBower 国家 key（小写），用于内部 API 过滤 */
const ISO_TO_BOWER_KEY: Record<string, string> = {
  US: 'usa', RU: 'russia', CN: 'china', GB: 'england',
  DE: 'germany', FR: 'france', IN: 'india', BR: 'brazil',
  JP: 'japan', KR: 'south korea', VN: 'vietnam', ID: 'indonesia',
  PH: 'philippines', NG: 'nigeria', KE: 'kenya',
  SG: 'singapore', MY: 'malaysia', CA: 'canada', AU: 'australia',
  MX: 'mexico',
}

/** V3 降级时 bower key（如 'usa'）→ ISO 码（如 'US'），用于 blockedCountries 匹配 */
const BOWER_KEY_TO_ISO: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_TO_BOWER_KEY).map(([iso, key]) => [key, iso]),
)

function isoToSmsBowerKey(iso: string): string | null {
  return ISO_TO_BOWER_KEY[iso.toUpperCase()] ?? null
}

// ─── Official country list cache ──────────────────────────────────────────────

interface OfficialCountry {
  id: number
  eng: string
}

// ─── SmsBowerAdapter ─────────────────────────────────────────────────────────

export class SmsBowerAdapter implements SmsProvider {
  constructor(private apiKey: string) {}

  /** 官方 country ID 缓存：ISO 码 → 官方数字 ID（如 'US' → 187） */
  private _officialCountryCache: Map<string, number> | null = null

  /**
   * 获取 ISO → 官方 country ID 的映射。
   * 内部 API 的 country.id（如 69）与官方 API 的 country code（如 187）是两套编号，
   * 必须调用 getCountries 拿官方 ID，否则 getNumberV2 会报错。
   */
  private async _getOfficialCountryId(iso: string, titleFallback?: string): Promise<number | undefined> {
    if (!this._officialCountryCache) {
      try {
        const res = await fetch(`${OFFICIAL_BASE}?api_key=${encodeURIComponent(this.apiKey)}&action=getCountries`)
        const text = await res.text()
        console.log(`[smsbower] getCountries status=${res.status} body(前300)=${text.slice(0, 300)}`)
        const parsed = JSON.parse(text) as unknown
        // 可能是数组，也可能是对象（{ id: { eng, rus, chn } } 格式）
        this._officialCountryCache = new Map()
        if (Array.isArray(parsed)) {
          for (const c of parsed as OfficialCountry[]) {
            if (c.eng) this._officialCountryCache.set(c.eng.toLowerCase(), c.id)
          }
        } else if (parsed && typeof parsed === 'object') {
          // 对象格式：{ "1": { "eng": "Russia", ... }, "2": { ... } }
          for (const [id, val] of Object.entries(parsed as Record<string, { eng?: string }>)) {
            if (val?.eng) this._officialCountryCache.set(val.eng.toLowerCase(), Number(id))
          }
        }
        console.log(`[smsbower] getCountries 缓存了 ${this._officialCountryCache.size} 个国家`)
      } catch (err) {
        console.warn('[smsbower] getCountries 失败，country 参数将不传:', err)
        this._officialCountryCache = new Map()  // 空缓存，避免反复请求
      }
    }

    // 优先用 ISO 精确匹配（getCountries 通常不含 ISO 字段，用英文名匹配）
    const isoToEngName: Record<string, string> = {
      US: 'united states', RU: 'russia', CN: 'china', GB: 'england',
      DE: 'germany', FR: 'france', IN: 'india', BR: 'brazil',
      JP: 'japan', KR: 'south korea', VN: 'vietnam', ID: 'indonesia',
      PH: 'philippines', NG: 'nigeria', KE: 'kenya',
      SG: 'singapore', MY: 'malaysia', CA: 'canada', AU: 'australia',
      MX: 'mexico', UA: 'ukraine', PL: 'poland', TR: 'turkey',
      TH: 'thailand', PK: 'pakistan', BD: 'bangladesh', EG: 'egypt',
    }
    const engName = isoToEngName[iso.toUpperCase()]
    if (engName) {
      const id = this._officialCountryCache.get(engName)
      if (id !== undefined) return id
    }

    // 用内部 API 的 title 做模糊匹配兜底
    if (titleFallback) {
      const id = this._officialCountryCache.get(titleFallback.toLowerCase())
      if (id !== undefined) return id
    }

    return undefined
  }

  // ─── getBowerPoolStatus / getPoolStatus ─────────────────────────────────────
  // 优先用内部 getPricesByService（含等级/交付率），降级到官方 getPricesV3

  /**
   * 获取号池数据并标注数据来源（internal / v3）。
   * 供 pool 路由直接调用，携带 dataSource 用于前端展示降级提示。
   */
  async getBowerPoolStatus(
    externalServiceId: string,
  ): Promise<{ dataSource: 'internal' | 'v3'; positions: PoolCountryStatus[] }> {
    // 1. 尝试内部 API
    try {
      const url = `${INTERNAL_BASE}/getPricesByService?serviceId=${encodeURIComponent(externalServiceId)}&api_key=${encodeURIComponent(this.apiKey)}`
      console.log(`[smsbower] getPoolStatus → 内部 API: ${INTERNAL_BASE}/getPricesByService?serviceId=${externalServiceId}&api_key=***`)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      let result: InternalPricesResponse | null = null
      try {
        const res = await fetch(url, { signal: ctrl.signal })
        console.log(`[smsbower] getPricesByService status=${res.status}`)
        if (res.ok) {
          const text = await res.text()
          console.log(`[smsbower] getPricesByService body(前1500)=${text.slice(0, 1500)}`)
          let data: unknown
          try { data = JSON.parse(text) } catch { data = null }
          if (data && typeof data === 'object' && !Array.isArray(data) && !(data as Record<string, unknown>).error) {
            result = data as InternalPricesResponse
          }
        }
      } finally {
        clearTimeout(timer)
      }

      if (result) {
        const countryCount = Object.values(result.services).reduce((n, s) => n + Object.keys(s.countries).length, 0)
        console.log(`[smsbower] 使用内部 API 数据，countries=${countryCount}`)
        return { dataSource: 'internal', positions: this._parseInternalPrices(result) }
      }
      console.warn('[smsbower] 内部 API 返回无效数据，降级到 getPricesV3')
    } catch (err) {
      console.warn('[smsbower] getPricesByService 请求失败，降级到 getPricesV3:', err)
    }

    // 2. 降级：官方 getPricesV3
    return { dataSource: 'v3', positions: await this._fetchPricesV3(externalServiceId) }
  }

  /** 实现 SmsProvider 接口；内部调用（如 orderNumber）走此方法 */
  async getPoolStatus(externalServiceId: string): Promise<PoolCountryStatus[]> {
    const { positions } = await this.getBowerPoolStatus(externalServiceId)
    return positions
  }

  private _parseInternalPrices(data: InternalPricesResponse): PoolCountryStatus[] {
    const result: PoolCountryStatus[] = []
    for (const serviceData of Object.values(data.services)) {
      for (const country of Object.values(serviceData.countries)) {
        if (!country.positions) continue
        for (const pos of Object.values(country.positions)) {
          const desc = (pos.rank?.description ?? '').toLowerCase()
          const rank: 'Gold' | 'Silver' | 'Bronze' | undefined =
            desc === 'gold' ? 'Gold'
            : desc === 'silver' ? 'Silver'
            : desc === 'bronze' ? 'Bronze'
            : undefined
          result.push({
            countryId: country.id,   // 内部 ID（非官方编号，仅用于过滤后回查 iso/title）
            name: country.title,
            shortName: country.iso,  // ISO 码，用于过滤 + 查官方 country ID
            price: pos.price,
            lowPrice: pos.price,
            successRate: 0,
            stock: pos.count,
            rank,
            agentIds: pos.agent_ids.map(String),
          })
        }
      }
    }
    return result
  }

  private async _fetchPricesV3(externalServiceId: string): Promise<PoolCountryStatus[]> {
    const url = `${OFFICIAL_BASE}?api_key=${encodeURIComponent(this.apiKey)}&action=getPricesV3&service=${encodeURIComponent(externalServiceId)}`
    console.log(`[smsbower] getPoolStatus → 官方 getPricesV3: ${OFFICIAL_BASE}?action=getPricesV3&service=${externalServiceId}&api_key=***`)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      // SMSBower 错误时返回纯文本（如 BAD_SERVICE / BAD_KEY），需先读 text
      const text = await res.text()
      console.log(`[smsbower] getPricesV3 status=${res.status} body(前200)=${text.slice(0, 200)}`)
      if (!res.ok || text.startsWith('BAD_') || text.startsWith('ERROR')) {
        throw new Error(`SMSBower getPricesV3 error: ${text || res.status}`)
      }
      let data: V3Response
      try {
        data = JSON.parse(text) as V3Response
      } catch {
        throw new Error(`SMSBower getPricesV3 非预期响应: ${text.slice(0, 80)}`)
      }

      const positions: PoolCountryStatus[] = []
      for (const [countryKey, serviceMap] of Object.entries(data)) {
        const providerMap = serviceMap[externalServiceId]
        if (!providerMap) continue
        for (const [providerId, entry] of Object.entries(providerMap)) {
          positions.push({
            countryId: countryKey,
            name: titleCase(countryKey),
            shortName: BOWER_KEY_TO_ISO[countryKey] ?? countryKey,
            price: parseFloat(String(entry.price)),
            lowPrice: parseFloat(String(entry.price)),
            successRate: 0,  // V3 不含交付率
            stock: parseInt(String(entry.count), 10) || 0,
            agentIds: [String(entry.provider_id || providerId)],
          })
        }
      }
      return positions
    } finally {
      clearTimeout(timer)
    }
  }

  // ─── orderNumber ────────────────────────────────────────────────────────────

  async orderNumber(externalServiceId: string, options: OrderOptions): Promise<OrderResult> {
    // 获取号池，筛选合适的供应商
    let positions: PoolCountryStatus[] = []
    try {
      positions = await this.getPoolStatus(externalServiceId)
    } catch (err) {
      console.error('[smsbower] getPoolStatus for orderNumber failed:', err)
    }

    console.log(
      `[smsbower] orderNumber service=${externalServiceId} countryCode=${options.countryCode ?? 'any'}` +
      ` maxPrice=${options.maxPrice} totalPositions=${positions.length}` +
      ` positionsSample=${JSON.stringify(positions.slice(0, 5).map(p => ({ shortName: p.shortName, stock: p.stock, price: p.price, rank: p.rank })))}`,
    )

    // 若指定了国家，只取该国的供应商
    // 注意：内部 API 返回的 shortName 是 ISO 码（如 'US'），官方 V3 返回的是 bowerKey（如 'usa'）
    // 因此需要同时匹配两种格式
    if (options.countryCode) {
      const isoUpper = options.countryCode.toUpperCase()
      const bowerKey = isoToSmsBowerKey(isoUpper) // 'US' → 'usa'

      console.log(
        `[smsbower] 国家过滤: isoUpper=${isoUpper} bowerKey=${bowerKey}` +
        ` 所有 shortName=[${[...new Set(positions.map(p => p.shortName))].join(', ')}]`,
      )

      const targeted = positions.filter(p => {
        const sn = p.shortName.toLowerCase()
        // 同时匹配 ISO 码（内部 API：'us'）和 bowerKey（官方 V3：'usa'）
        return sn === isoUpper.toLowerCase() || (bowerKey !== null && sn === bowerKey)
      })

      console.log(
        `[smsbower] 过滤后: targeted=${targeted.length}` +
        ` (有库存=${targeted.filter(p => p.stock > 0).length})` +
        ` detail=${JSON.stringify(targeted.map(p => ({ shortName: p.shortName, stock: p.stock, price: p.price, rank: p.rank, agentIds: p.agentIds })))}`,
      )

      if (targeted.length === 0) {
        throw new Error(`该 CDK 仅限 ${options.countryCode} 国家使用，但该国家暂无可用号码`)
      }
      positions = targeted
    }

    // 过滤有库存 + 价格在预算内，排序 Gold→Silver→Bronze→rate↓→price↑
    const RANK_ORDER: Record<string, number> = { Gold: 0, Silver: 1, Bronze: 2 }
    const qualified = positions
      .filter(p => p.stock > 0 && p.price <= (options.maxPrice ?? Infinity))
      .sort((a, b) => {
        const ra = RANK_ORDER[a.rank ?? ''] ?? 3
        const rb = RANK_ORDER[b.rank ?? ''] ?? 3
        if (ra !== rb) return ra - rb
        if (b.successRate !== a.successRate) return b.successRate - a.successRate
        if (a.price !== b.price) return a.price - b.price
        return b.stock - a.stock
      })

    console.log(
      `[smsbower] 合格 positions（有库存且价格达标）: ${qualified.length}` +
      ` maxPrice=${options.maxPrice}` +
      ` 无库存排除=${positions.filter(p => p.stock === 0).length}` +
      ` 超价排除=${positions.filter(p => p.stock > 0 && p.price > (options.maxPrice ?? Infinity)).length}`,
    )

    // 取前 5 个供应商 ID
    const providerIds = [...new Set(qualified.flatMap(p => p.agentIds ?? []))].slice(0, 5)
    if (providerIds.length === 0 && positions.length > 0) {
      // 全部无库存，依然尝试前 3 个
      positions.slice(0, 3).forEach(p => (p.agentIds ?? []).forEach(id => providerIds.push(id)))
    }

    // 官方 getNumberV2 要求服务代码（如 'oi'），而非内部数字 ID
    const serviceCode = options.officialServiceCode ?? externalServiceId
    if (!options.officialServiceCode) {
      console.warn(
        `[smsbower] officialServiceCode 未配置，将用 externalServiceId=${externalServiceId} 作为服务代码，` +
        '如遇 WRONG_SERVICE 错误，请在 Admin → Service 管理中填写「官方服务代码」',
      )
    }

    // 获取官方 country ID（官方 API 编号体系与内部 API 不同，需通过 getCountries 查）
    // shortName 是 ISO 码（如 'US'），name 是英文名（如 'United States'）
    let officialCountryId: number | undefined
    if (options.countryCode) {
      const iso = options.countryCode.toUpperCase()
      const titleFallback = qualified[0]?.name ?? undefined
      officialCountryId = await this._getOfficialCountryId(iso, titleFallback)
      console.log(`[smsbower] 官方 country ID 查询: iso=${iso} title=${titleFallback} → officialId=${officialCountryId ?? '未找到，不传 country'}`)
    }

    const params = new URLSearchParams({
      api_key: this.apiKey,
      action: 'getNumberV2',
      service: serviceCode,
    })
    if (officialCountryId !== undefined) params.set('country', String(officialCountryId))
    if (providerIds.length > 0) params.set('providerIds', providerIds.join(','))

    // 打印完整请求 URL（api_key 脱敏）
    const debugParams = new URLSearchParams(params)
    debugParams.set('api_key', '***')
    console.log(
      `[smsbower] getNumberV2 完整请求: ${OFFICIAL_BASE}?${debugParams.toString()}`,
    )

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    let res: Response
    try {
      res = await fetch(`${OFFICIAL_BASE}?${params.toString()}`, { signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }

    // getNumberV2 成功返回 JSON，失败返回纯文本错误码
    const rawText = await res.text()
    console.log(`[smsbower] getNumberV2 status=${res.status} body=${rawText.slice(0, 300)}`)

    if (!res.ok || rawText.startsWith('BAD_') || rawText.startsWith('NO_') || rawText.startsWith('ERROR')) {
      throw new Error(`暂无可用号码：${rawText}`)
    }
    let data: GetNumberV2Response
    try {
      data = JSON.parse(rawText) as GetNumberV2Response
    } catch {
      throw new Error(`SMSBower 取号异常响应: ${rawText.slice(0, 80)}`)
    }

    if (!data.activationId || !data.phoneNumber) {
      throw new Error(data.error ?? '暂无可用号码，请稍后重试')
    }

    const expiresIn = parseActivationTime(data.activationTime)
    console.log(
      `[smsbower] 取号成功 activationId=${data.activationId}` +
      ` phoneNumber=${data.phoneNumber} activationTime=${data.activationTime} → expiresIn=${expiresIn}s`,
    )

    return {
      orderId: String(data.activationId),
      phoneNumber: String(data.phoneNumber),
      expiresIn,
    }
  }

  // ─── pollOrder ──────────────────────────────────────────────────────────────

  async pollOrder(externalOrderId: string): Promise<PollResult> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      action: 'getStatus',
      id: externalOrderId,
    })

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    let res: Response
    try {
      res = await fetch(`${OFFICIAL_BASE}?${params.toString()}`, { signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) throw new Error('SMSBower 状态查询失败')

    const text = (await res.text()).trim()
    console.log(`[smsbower] getStatus id=${externalOrderId} response=${text}`)

    if (text === 'STATUS_WAIT_CODE') {
      return { status: 'pending' }
    }

    if (text === 'STATUS_CANCEL') {
      return { status: 'cancelled' }
    }

    if (text.startsWith('STATUS_OK:')) {
      const code = text.slice('STATUS_OK:'.length)
      return {
        status: 'received',
        smsContent: code,
        verificationCode: code,
      }
    }

    if (text.startsWith('STATUS_WAIT_RETRY:')) {
      // 等待下一条短信（已有一条但还没确认）
      return { status: 'pending' }
    }

    // 未知响应
    console.warn(`[smsbower] unknown getStatus response: ${text}`)
    return { status: 'pending' }
  }

  // ─── cancelOrder ────────────────────────────────────────────────────────────

  async cancelOrder(externalOrderId: string): Promise<void> {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        action: 'setStatus',
        id: externalOrderId,
        status: '8',
      })
      await fetch(`${OFFICIAL_BASE}?${params.toString()}`)
    } catch {
      // 尽力取消，忽略错误
    }
  }

  // ─── retryOrder（请求再发一条短信，对应 status=3）──────────────────────────

  async retryOrder(externalOrderId: string): Promise<void> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      action: 'setStatus',
      id: externalOrderId,
      status: '3',
    })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const res = await fetch(`${OFFICIAL_BASE}?${params.toString()}`, { signal: ctrl.signal })
      const text = (await res.text()).trim()
      if (text !== 'ACCESS_RETRY_GET') {
        throw new Error(`SMSBower retryOrder 失败: ${text}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  // ─── confirmOrder（完成激活，对应 status=6）──────────────────────────────────

  async confirmOrder(externalOrderId: string): Promise<void> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      action: 'setStatus',
      id: externalOrderId,
      status: '6',
    })
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      await fetch(`${OFFICIAL_BASE}?${params.toString()}`, { signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}
