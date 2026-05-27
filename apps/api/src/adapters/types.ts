export interface OrderOptions {
  maxPrice: number
  successRateThreshold: number
  blockedCountries: string[]
  /** ISO 2-letter country code; if set, only this country is attempted */
  countryCode?: string
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
}
