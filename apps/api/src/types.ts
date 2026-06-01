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
  /** 接码 API 每分钟每 CDK 最大请求次数，默认 20 */
  RATE_LIMIT_CODE_API?: string
  /** yamasakisms 账户 user_id */
  YAMASAKISMS_USER_ID?: string
  /** yamasakisms 账户 user_code */
  YAMASAKISMS_USER_CODE?: string
  /** yamasakisms 签名用 api_key */
  YAMASAKISMS_API_KEY?: string
  /** 对外接码 API 的 base URL，如 https://sms.985008.xyz */
  SELF_BASE_URL?: string
}

export type Variables = {
  requestId: string
}
