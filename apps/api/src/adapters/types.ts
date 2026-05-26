export interface OrderOptions {
  maxPrice: number
  successRateThreshold: number
}

export interface OrderResult {
  orderId: string      // SMSPool 的 order_code
  phoneNumber: string
  expiresIn: number    // 剩余秒数
}

export interface PollResult {
  status: 'pending' | 'completed' | 'expired' | 'cancelled'
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
}

export interface SmsProvider {
  orderNumber(externalServiceId: string, options: OrderOptions): Promise<OrderResult>
  pollOrder(externalOrderId: string): Promise<PollResult>
  cancelOrder(externalOrderId: string): Promise<void>
  getPoolStatus(externalServiceId: string): Promise<PoolCountryStatus[]>
}
