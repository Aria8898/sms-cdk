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
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'received'
  smsContent?: string
  verificationCode?: string
  timeLeft?: number
  canRetry?: boolean
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

export type MockScenario =
  | 'received'
  | 'completed'
  | 'timeout'
  | 'create_fail'
  | 'retry_fail'
  | 'finish_fail'

/** MockPanel 通过直接修改此对象的字段来控制 mock 行为，无需重新导入 */
export const mockConfig = {
  enabled: false,
  scenario: 'received' as MockScenario,
  delayMs: 3000,
  canRetry: true,
}

/** createOrder / retryOrder 成功时记录时间，pollOrder 据此判断是否还在"等待"阶段 */
let _mockOrderStartedAt = 0

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function mockCreateOrder(_cdkId: string, _serviceId?: string): Promise<OrderResult> {
  if (mockConfig.scenario === 'create_fail') {
    await sleep(800)
    throw new Error('取号失败（Mock）')
  }
  await sleep(600)
  _mockOrderStartedAt = Date.now()
  return { orderId: 'mock-order-id', phoneNumber: '+1 555 847 2910', expiresIn: 1200 }
}

async function mockPollOrder(_orderId: string): Promise<PollResult> {
  // 模拟等待阶段：在 delayMs 内持续返回 pending
  if (Date.now() - _mockOrderStartedAt < mockConfig.delayMs) {
    return { status: 'pending' }
  }
  switch (mockConfig.scenario) {
    case 'received':
      return {
        status: 'received',
        smsContent: 'Your OpenAI verification code is 847291. Do not share it.',
        verificationCode: '847291',
        canRetry: mockConfig.canRetry,
      }
    case 'completed':
      return {
        status: 'completed',
        smsContent: 'Your OpenAI verification code is 847291.',
        verificationCode: '847291',
      }
    case 'timeout':
      return { status: 'expired' }
    default:
      return { status: 'pending' }
  }
}

async function mockRetryOrder(_orderId: string): Promise<{ success: boolean }> {
  if (mockConfig.scenario === 'retry_fail') {
    await sleep(500)
    throw new Error('再发失败（Mock）')
  }
  await sleep(500)
  // 重置计时，让下一轮轮询重新经历等待阶段
  _mockOrderStartedAt = Date.now()
  return { success: true }
}

async function mockFinishOrder(_orderId: string): Promise<{ success: boolean }> {
  if (mockConfig.scenario === 'finish_fail') {
    await sleep(500)
    throw new Error('完成失败（Mock）')
  }
  await sleep(500)
  return { success: true }
}

// ─── API ──────────────────────────────────────────────────────────────────────

function withMock<TArgs extends unknown[], TReturn>(
  real: (...args: TArgs) => Promise<TReturn>,
  mock: (...args: TArgs) => Promise<TReturn>,
) {
  return (...args: TArgs): Promise<TReturn> =>
    mockConfig.enabled ? mock(...args) : real(...args)
}

export const cdkApi = {
  // validate 始终使用真实请求
  validate: (code: string) =>
    request<ValidateResult>('/api/cdk/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  createOrder: withMock(
    (cdkId: string, serviceId?: string) =>
      request<OrderResult>('/api/cdk/order', {
        method: 'POST',
        body: JSON.stringify({ cdkId, ...(serviceId ? { serviceId } : {}) }),
      }),
    mockCreateOrder,
  ),

  pollOrder: withMock(
    (orderId: string) => request<PollResult>(`/api/cdk/order/${orderId}/status`),
    mockPollOrder,
  ),

  retryOrder: withMock(
    (orderId: string) =>
      request<{ success: boolean }>(`/api/cdk/order/${orderId}/retry`, { method: 'POST' }),
    mockRetryOrder,
  ),

  finishOrder: withMock(
    (orderId: string) =>
      request<{ success: boolean }>(`/api/cdk/order/${orderId}/finish`, { method: 'POST' }),
    mockFinishOrder,
  ),
}
