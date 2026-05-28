export interface OrderOptions {
  maxPrice: number
  successRateThreshold: number
  blockedCountries: string[]
  /** ISO 2-letter country code; if set, only this country is attempted */
  countryCode?: string
  /**
   * SMSBower 官方 API 服务代码（如 'oi'），用于 getNumberV2 接口。
   * 与 externalServiceId（内部数字 ID，用于 getPricesByService）不同。
   * 未设置时回落到 externalServiceId（可能导致 WRONG_SERVICE 错误）。
   */
  officialServiceCode?: string
}

export interface OrderResult {
  orderId: string      // SMSPool 的 order_code
  phoneNumber: string
  expiresIn: number    // 剩余秒数
}

export interface PollResult {
  /** received = SMSBower STATUS_OK（短信已收到，可选继续接收） */
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'received'
  smsContent?: string
  verificationCode?: string
  timeLeft?: number
}

export interface PoolCountryStatus {
  countryId: number | string
  name: string
  shortName: string
  price: number
  lowPrice: number
  successRate: number
  stock: number
  /** SMSBower：等级 Gold / Silver / Bronze */
  rank?: 'Gold' | 'Silver' | 'Bronze'
  /** SMSBower：该 position 的供应商 ID 列表 */
  agentIds?: string[]
}

export interface SmsProvider {
  orderNumber(externalServiceId: string, options: OrderOptions): Promise<OrderResult>
  pollOrder(externalOrderId: string): Promise<PollResult>
  cancelOrder(externalOrderId: string): Promise<void>
  getPoolStatus(externalServiceId: string): Promise<PoolCountryStatus[]>
  /** SMSBower：请求重发短信（status=3），其他适配器可 no-op */
  retryOrder(externalOrderId: string): Promise<void>
  /** SMSBower：确认激活结束（status=6），其他适配器可 no-op */
  confirmOrder(externalOrderId: string): Promise<void>
}
