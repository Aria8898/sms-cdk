import { SmsPoolAdapter } from './smspool'
import { SmsBowerAdapter } from './smsbower'
import { YamasakismsAdapter } from './yamasakisms'
import type { SmsProvider, BoundSmsProvider } from './types'
import type { Bindings } from '../types'

export function getApiKey(slug: string, env: Bindings): string {
  switch (slug) {
    case 'smspool': return env.SMSPOOL_API_KEY
    case 'smsbower': return env.SMSBOWER_API_KEY
    default: throw new Error(`Unknown provider: ${slug}`)
  }
}

export function getProvider(slug: string, apiKey: string): SmsProvider {
  if (slug === 'smspool') return new SmsPoolAdapter(apiKey)
  if (slug === 'smsbower') return new SmsBowerAdapter(apiKey)
  throw new Error(`Unknown provider: ${slug}`)
}

export function getBoundProvider(slug: string, env: Bindings, d1: D1Database): BoundSmsProvider {
  if (slug === 'yamasakisms') {
    const userId = env.YAMASAKISMS_USER_ID
    const userCode = env.YAMASAKISMS_USER_CODE
    const apiKey = env.YAMASAKISMS_API_KEY
    if (!userId || !userCode || !apiKey) {
      throw new Error('yamasakisms 环境变量未配置（YAMASAKISMS_USER_ID / YAMASAKISMS_USER_CODE / YAMASAKISMS_API_KEY）')
    }
    return new YamasakismsAdapter(d1, userId, userCode, apiKey)
  }
  throw new Error(`Unknown bound provider: ${slug}`)
}

export { SmsBowerAdapter } from './smsbower'
export { YamasakismsAdapter } from './yamasakisms'

export type { SmsProvider, BoundSmsProvider, OrderResult, PollResult } from './types'
