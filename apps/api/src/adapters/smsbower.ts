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
 * 解析 activationTime 为剩余秒数（默认 1500 秒兜底）。
 * 格式待调试：可能是 ISO 日期字符串、Unix 时间戳（秒）或直接秒数。
 */
function parseActivationTime(value: string | number | undefined): number {
  if (value == null) return 1500
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isNaN(num)) {
    // Unix 时间戳（> 1e9）
    if (num > 1_000_000_000) {
      const remaining = Math.round((num * 1000 - Date.now()) / 1000)
      return remaining > 0 ? remaining : 1500
    }
    // 直接秒数
    return num > 0 ? num : 1500
  }
  // 尝试 ISO 日期字符串
  try {
    const ms = new Date(String(value)).getTime()
    if (!isNaN(ms)) {
      const remaining = Math.round((ms - Date.now()) / 1000)
      return remaining > 0 ? remaining : 1500
    }
  } catch { /* ignore */ }
  return 1500
}

/**
 * ISO 2 字母码 → SMSBower 可能使用的国家 key（小写）
 * 仅列举常用国家，未匹配则返回 null
 */
function isoToSmsBowerKey(iso: string): string | null {
  const MAP: Record<string, string> = {
    US: 'usa', RU: 'russia', CN: 'china', GB: 'england',
    DE: 'germany', FR: 'france', IN: 'india', BR: 'brazil',
    JP: 'japan', KR: 'south korea', VN: 'vietnam', ID: 'indonesia',
    PH: 'philippines', NG: 'nigeria', KE: 'kenya',
    SG: 'singapore', MY: 'malaysia', CA: 'canada', AU: 'australia',
    MX: 'mexico',
  }
  return MAP[iso.toUpperCase()] ?? null
}

// ─── SmsBowerAdapter ─────────────────────────────────────────────────────────

export class SmsBowerAdapter implements SmsProvider {
  constructor(private apiKey: string) {}

  // ─── getPoolStatus ──────────────────────────────────────────────────────────
  // 优先用内部 getPricesByService（含等级/交付率），降级到官方 getPricesV3

  async getPoolStatus(externalServiceId: string): Promise<PoolCountryStatus[]> {
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
        return this._parseInternalPrices(result)
      }
      console.warn('[smsbower] 内部 API 返回无效数据，降级到 getPricesV3')
    } catch (err) {
      console.warn('[smsbower] getPricesByService 请求失败，降级到 getPricesV3:', err)
    }

    // 2. 降级：官方 getPricesV3
    return this._fetchPricesV3(externalServiceId)
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
            countryId: country.iso,
            name: country.title,
            shortName: country.iso,
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
            shortName: countryKey,
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

    // 若指定了国家，只取该国的供应商
    if (options.countryCode) {
      const bowerKey = isoToSmsBowerKey(options.countryCode)
      const targeted = positions.filter(p =>
        bowerKey
          ? p.shortName.toLowerCase() === bowerKey
          : p.shortName.toLowerCase() === options.countryCode!.toLowerCase(),
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

    // 取前 5 个供应商 ID
    const providerIds = [...new Set(qualified.flatMap(p => p.agentIds ?? []))].slice(0, 5)
    if (providerIds.length === 0 && positions.length > 0) {
      // 全部无库存，依然尝试前 3 个
      positions.slice(0, 3).forEach(p => (p.agentIds ?? []).forEach(id => providerIds.push(id)))
    }

    const params = new URLSearchParams({
      api_key: this.apiKey,
      action: 'getNumberV2',
      service: externalServiceId,
    })
    if (providerIds.length > 0) params.set('providerIds', providerIds.join(','))

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
