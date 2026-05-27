import { SmsPoolAdapter } from './smspool'
import type { SmsProvider } from './types'
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
  if (slug === 'smsbower') throw new Error('SMSBower 适配器尚未实现，请使用 SMSPool 服务')
  throw new Error(`Unknown provider: ${slug}`)
}

export type { SmsProvider, OrderResult, PollResult } from './types'
