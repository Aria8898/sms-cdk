const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `请求失败 (${res.status})`)
  }
  return res.json() as Promise<T>
}

export interface PoolOption {
  serviceId: string
  alias: string
  isDefault: boolean
  hasStock: boolean
}

export interface ValidateResult {
  cdkId: string
  service: { name: string }
  remaining: number
  total: number
  countryCode?: string
  pools: PoolOption[]
}

export interface OrderResult {
  orderId: string
  phoneNumber: string
  expiresIn: number
}

export interface PollResult {
  status: 'pending' | 'completed' | 'expired' | 'cancelled'
  smsContent?: string
  verificationCode?: string
  timeLeft?: number
}

export const cdkApi = {
  validate: (code: string) =>
    request<ValidateResult>('/api/cdk/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  createOrder: (cdkId: string, serviceId?: string) =>
    request<OrderResult>('/api/cdk/order', {
      method: 'POST',
      body: JSON.stringify({ cdkId, ...(serviceId ? { serviceId } : {}) }),
    }),

  pollOrder: (orderId: string) =>
    request<PollResult>(`/api/cdk/order/${orderId}/status`),
}
