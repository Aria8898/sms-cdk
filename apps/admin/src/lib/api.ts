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
  successRateThreshold: number
  maxPrice: number
  blockedCountries: string[]
  createdAt: string
  cdkCount?: number
}
export interface Cdk {
  id: string; code: string; serviceId: string; serviceName: string
  totalUses: number; remainingUses: number; status: string
  hasPendingOrder: boolean; createdAt: string
}
export interface Order {
  id: string; cdkId: string; phoneNumber: string | null; smsContent: string | null
  verificationCode: string | null; status: string; createdAt: string; completedAt: string | null
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
    isDefault?: boolean
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
  }) => request<Service>('/api/services', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: {
    successRateThreshold?: number
    maxPrice?: number
    blockedCountries?: string[]
    isDefault?: boolean
  }) => request<Service>(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/services/${id}`, { method: 'DELETE' }),
}

// ---- Pool Monitor ----
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
  rank: number | null
}
export interface PoolStatusResult {
  service: {
    id: string
    name: string
    providerName: string
    successRateThreshold: number
    maxPrice: number
    blockedCountries: string[]
  }
  summary: {
    total: number
    qualified: number
    blocked: number
    topPicks: string[]
  }
  countries: PoolCountry[]
}

export const poolApi = {
  status: (serviceId: string) =>
    request<PoolStatusResult>(`/api/pool-status?serviceId=${encodeURIComponent(serviceId)}`),
}

// ---- CDKs ----
export const cdksApi = {
  list: (status?: string) =>
    request<Cdk[]>(`/api/cdks${status ? `?status=${status}` : ''}`),
  generate: (data: { serviceId: string; usesPerCdk: number; quantity: number }) =>
    request<{ cdks: Cdk[] }>('/api/cdks/generate', { method: 'POST', body: JSON.stringify(data) }),
  detail: (id: string) => request<CdkDetail>(`/api/cdks/${id}`),
  disable: (id: string) =>
    request<Cdk>(`/api/cdks/${id}/disable`, { method: 'PATCH' }),
  enable: (id: string) =>
    request<Cdk>(`/api/cdks/${id}/enable`, { method: 'PATCH' }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/cdks/${id}`, { method: 'DELETE' }),
}
