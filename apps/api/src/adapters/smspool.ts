import type { SmsProvider, OrderOptions, OrderResult, PollResult, PoolCountryStatus } from './types'

const BASE_URL = 'https://api.smspool.net'

interface SuccessRateEntry {
  country_id: number | string
  name: string
  short_name: string
  price: string
  low_price: string
  success_rate: number
  stock: number
}

interface PurchaseResponse {
  success: number
  number?: number | string
  phonenumber?: string
  cc?: string
  order_id?: string
  orderid?: string
  expires_in?: number
  message?: string
  [key: string]: unknown
}

interface CheckResponse {
  status: number
  time_left?: number
  sms?: string | null
  full_code?: string | null
  code?: string | null
  [key: string]: unknown
}

export class SmsPoolAdapter implements SmsProvider {
  constructor(private apiKey: string) {}

  async orderNumber(externalServiceId: string, options: OrderOptions): Promise<OrderResult> {
    // 1. 获取各国成功率
    let candidates: SuccessRateEntry[] = []
    try {
      const url = `${BASE_URL}/request/success_rate?service=${encodeURIComponent(externalServiceId)}`
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await fetch(url, { signal: ctrl.signal })
        console.log(`[smspool] success_rate status=${res.status}`)
        if (res.ok) {
          const data = await res.json()
          console.log(`[smspool] success_rate data=`, JSON.stringify(data).slice(0, 200))
          if (Array.isArray(data)) {
            candidates = data
          }
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      console.error(`[smspool] success_rate fetch error:`, err)
    }

    // 过滤成功率达标 + 价格在预算内的国家，按 low_price 升序（优先最便宜）
    let qualified = candidates
      .filter((c) => c.success_rate >= options.successRateThreshold && parseFloat(c.low_price) <= options.maxPrice)
      .sort((a, b) => parseFloat(a.low_price) - parseFloat(b.low_price))

    // 若无符合条件的国家，取前 3 个作为 fallback
    if (qualified.length === 0) {
      qualified = [...candidates].sort((a, b) => b.success_rate - a.success_rate).slice(0, 3)
    }

    // 最多尝试前 3 个候选国家
    const toTry = qualified.slice(0, 3)

    for (const country of toTry) {
      try {
        const params = {
          key: this.apiKey,
          country: String(country.country_id),
          service: externalServiceId,
          max_price: String(options.maxPrice),
          pricing_option: '0',
        }

        const body = new URLSearchParams(params)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 10000)
        const res = await fetch(`${BASE_URL}/purchase/sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: ctrl.signal,
        }).finally(() => clearTimeout(timer))

        console.log(`[smspool] purchase/sms country=${country.country_id} status=${res.status}`)
        if (!res.ok) continue

        const data = await res.json() as PurchaseResponse
        console.log(`[smspool] purchase/sms response=`, JSON.stringify(data))
        const orderId = data.order_id ?? data.orderid
        if (data.success === 1 && orderId) {
          const phoneNumber = (data.cc && data.phonenumber)
            ? `+${data.cc}${data.phonenumber}`
            : String(data.number ?? '')
          return {
            orderId,
            phoneNumber,
            expiresIn: data.expires_in ?? 1200,
          }
        }
      } catch (err) {
        console.error(`[smspool] purchase/sms country=${country.country_id} error:`, err)
      }
    }

    throw new Error('暂无可用号码，请稍后重试')
  }

  async pollOrder(externalOrderId: string): Promise<PollResult> {
    try {
      const body = new URLSearchParams({
        key: this.apiKey,
        orderid: externalOrderId,
      })

      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      const res = await fetch(`${BASE_URL}/sms/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer))

      if (!res.ok) {
        throw new Error('查询订单状态失败')
      }

      const data = await res.json() as CheckResponse

      const timeLeft = data.time_left ?? 0

      if (data.status === 3) {
        return {
          status: 'completed',
          smsContent: (data.sms ?? data.full_code ?? undefined) as string | undefined,
          verificationCode: (data.code ?? undefined) as string | undefined,
          timeLeft,
        }
      }

      if (data.status === 6 || timeLeft <= 0) {
        return { status: 'expired', timeLeft: 0 }
      }

      if (data.status === 1) {
        return { status: 'pending', timeLeft }
      }

      return { status: 'cancelled', timeLeft }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : '查询订单状态失败')
    }
  }

  async getPoolStatus(externalServiceId: string): Promise<PoolCountryStatus[]> {
    const url = `${BASE_URL}/request/success_rate?service=${encodeURIComponent(externalServiceId)}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`SMSPool API error: ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) return []
      return (data as SuccessRateEntry[]).map(c => ({
        countryId: c.country_id,
        name: c.name,
        shortName: c.short_name,
        price: parseFloat(c.price),
        lowPrice: parseFloat(c.low_price),
        successRate: c.success_rate,
        stock: c.stock,
      }))
    } finally {
      clearTimeout(timer)
    }
  }

  async cancelOrder(externalOrderId: string): Promise<void> {
    try {
      const body = new URLSearchParams({
        key: this.apiKey,
        orderid: externalOrderId,
      })

      await fetch(`${BASE_URL}/sms/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch {
      // 尽力取消，忽略错误
    }
  }
}
