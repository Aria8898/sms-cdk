const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401 && token) {
    // token 已过期，清除并跳回登录页
    localStorage.removeItem('admin_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `请求失败 (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---- Types ----
export interface Provider {
  id: string; name: string; alias: string; createdAt: string; serviceCount?: number
}
export interface ServiceCategory {
  id: string; name: string; shortName: string; createdAt: string
  services: Service[]
}
export interface Service {
  id: string
  providerId: string
  providerName: string
  providerAlias: string
  categoryId: string
  isDefault: boolean
  externalServiceId: string
  /** SMSBower 官方接口服务代码（如 'oi'），用于 getNumberV2；内部 API 仍用 externalServiceId */
  smsbowerServiceCode?: string | null
  successRateThreshold: number
  maxPrice: number
  blockedCountries: string[]
  createdAt: string
  cdkCount?: number
}
export interface Cdk {
  id: string; code: string; serviceId: string; serviceName: string
  categoryId: string | null; countryCode: string | null
  totalUses: number; remainingUses: number; status: string
  hasPendingOrder: boolean; createdAt: string
  cdkType: string; validityMinutes: number | null
}
export interface OrderSms {
  id: string
  orderId: string
  smsContent: string
  verificationCode: string
  receivedAt: string
}

export interface Order {
  id: string; cdkId: string; phoneNumber: string | null; smsContent: string | null
  verificationCode: string | null; status: string; createdAt: string; completedAt: string | null
  cancelledReason?: string | null
  fromOrderId?: string | null
  smsList?: OrderSms[]
}
export interface CdkDetail extends Cdk {
  service: Service; orders: Order[]
}

// ---- Auth ----
export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
}

// ---- Providers ----
export const providersApi = {
  list: () => request<Provider[]>('/api/providers'),
  create: (data: { name: string; slug: string; alias: string }) =>
    request<Provider>('/api/providers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { alias: string }) =>
    request<Provider>(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/providers/${id}`, { method: 'DELETE' }),
}

// ---- Service Categories ----
export const serviceCategoriesApi = {
  list: () => request<Array<ServiceCategory & { serviceCount?: number }>>('/api/service-categories'),
  create: (data: { name: string; shortName: string }) =>
    request<ServiceCategory>('/api/service-categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; shortName?: string }) =>
    request<ServiceCategory>(`/api/service-categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/service-categories/${id}`, { method: 'DELETE' }),
  migrate: () =>
    request<{ migrated: number; categories: number; message: string }>('/api/service-categories/migrate', { method: 'POST' }),
}

// ---- Services ----
export const servicesApi = {
  // 返回 ServiceCategory[] 分组视图
  list: () => request<ServiceCategory[]>('/api/services'),
  create: (data: {
    categoryId: string
    providerId: string
    externalServiceId: string
    smsbowerServiceCode?: string
    isDefault?: boolean
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
  }) => request<Service>('/api/services', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: {
    externalServiceId?: string
    smsbowerServiceCode?: string | null
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
    isDefault?: boolean
  }) => request<Service>(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/services/${id}`, { method: 'DELETE' }),
}

// ---- Pool Monitor ----

/** SMSPool 国家条目（含策略分析） */
export interface PoolCountry {
  countryId: number | string
  name: string
  shortName: string
  price: number
  lowPrice: number
  successRate: number
  stock: number
  blocked: boolean
  qualifies: boolean
  strategyRank: number | null   // SMSPool 策略排名（第 1/2/3 优先取号）
}

/** SMSBower 供应商 position 条目 */
export interface BowerPosition {
  countryId: number | string
  name: string
  shortName: string
  price: number
  lowPrice: number
  successRate: number      // 交付率 0-100（内部 API 有；V3 降级时为 0）
  stock: number
  rank?: 'Gold' | 'Silver' | 'Bronze'
  agentIds?: string[]
}

/** 统一响应结构（通过 providerSlug 区分） */
export type PoolStatusResult =
  | {
      providerSlug: 'smspool'
      service: {
        id: string; name: string; providerName: string; providerSlug: string
        successRateThreshold: number; maxPrice: number; blockedCountries: string[]
      }
      summary: { total: number; qualified: number; blocked: number; topPicks: string[] }
      countries: PoolCountry[]
    }
  | {
      providerSlug: 'smsbower'
      service: { id: string; name: string; providerName: string; providerSlug: string }
      positions: BowerPosition[]
    }

export const poolApi = {
  status: (serviceId: string, refresh = false) =>
    request<PoolStatusResult>(
      `/api/pool-status?serviceId=${encodeURIComponent(serviceId)}${refresh ? '&refresh=true' : ''}`,
    ),
}

// ---- Security ----
export interface LoginAttempt {
  id: string; ipAddress: string; success: boolean; createdAt: string
}
export interface LoginAttemptsResult {
  rows: LoginAttempt[]
  stats: { total: number; failures: number }
}
export const securityApi = {
  loginAttempts: (failOnly = false) =>
    request<LoginAttemptsResult>(`/api/security/login-attempts${failOnly ? '?fail=1' : ''}`),
}

// ---- CDKs ----
export const cdksApi = {
  list: (status?: string) =>
    request<Cdk[]>(`/api/cdks${status ? `?status=${status}` : ''}`),
  generate: (data: {
    categoryId: string
    usesPerCdk: number
    quantity: number
    countryCode?: string
    cdkType?: 'count' | 'timed'
    validityMinutes?: number
  }) =>
    request<{ cdks: Cdk[] }>('/api/cdks/generate', { method: 'POST', body: JSON.stringify(data) }),
  detail: (id: string) => request<CdkDetail>(`/api/cdks/${id}`),
  disable: (id: string) =>
    request<Cdk>(`/api/cdks/${id}/disable`, { method: 'PATCH' }),
  enable: (id: string) =>
    request<Cdk>(`/api/cdks/${id}/enable`, { method: 'PATCH' }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/cdks/${id}`, { method: 'DELETE' }),
}
