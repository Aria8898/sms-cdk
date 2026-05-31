export type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  SMSPOOL_API_KEY: string
  SMSBOWER_API_KEY: string
  /** validate 接口每分钟每 IP 最大请求次数，默认 10 */
  RATE_LIMIT_VALIDATE?: string
  /** 预留：登录异常通知 Webhook，留空则不通知 */
  NOTIFY_WEBHOOK_URL?: string
}

export type Variables = {
  requestId: string
}
