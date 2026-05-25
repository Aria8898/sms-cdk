import type { SmsProvider, OrderOptions, OrderResult, PollResult } from './types'

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
      console.log('[smspool] success_rate url:', url)
      const res = await fetch(url)
      const raw = await res.text()
      console.log('[smspool] success_rate status:', res.status, 'body:', raw.slice(0, 500))
      if (res.ok) {
        const data = JSON.parse(raw)
        if (Array.isArray(data)) {
          candidates = data
        }
      }
    } catch (err) {
      console.log('[smspool] success_rate error:', err)
    }

    console.log('[smspool] candidates count:', candidates.length, 'threshold:', options.successRateThreshold)

    // 过滤成功率达标 + 价格在预算内的国家，按 low_price 升序（优先最便宜）
    let qualified = candidates
      .filter((c) => c.success_rate >= options.successRateThreshold && parseFloat(c.low_price) <= options.maxPrice)
      .sort((a, b) => parseFloat(a.low_price) - parseFloat(b.low_price))

    console.log('[smspool] qualified after threshold filter:', qualified.length)

    // 若无符合条件的国家，取前 3 个作为 fallback
    if (qualified.length === 0) {
      qualified = [...candidates].sort((a, b) => b.success_rate - a.success_rate).slice(0, 3)
      console.log('[smspool] using fallback countries:', qualified.map(c => c.name))
    }

    // 最多尝试前 3 个候选国家
    const toTry = qualified.slice(0, 3)
    console.log('[smspool] will try countries:', toTry.map(c => `${c.name}(id=${c.name_id})`))

    for (const country of toTry) {
      try {
        const params = {
          key: this.apiKey,
          country: String(country.country_id),
          service: externalServiceId,
          max_price: String(options.maxPrice),
          pricing_option: '0',
        }
        console.log('[smspool] purchase/sms params (no key):', { ...params, key: '***' })

        const body = new URLSearchParams(params)
        const res = await fetch(`${BASE_URL}/purchase/sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })

        const raw = await res.text()
        console.log('[smspool] purchase/sms status:', res.status, 'body:', raw)

        if (!res.ok) continue

        const data = JSON.parse(raw) as PurchaseResponse

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
        console.log('[smspool] purchase/sms error for country', country.country, ':', err)
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

      const res = await fetch(`${BASE_URL}/sms/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })

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
