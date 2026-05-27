import { SmsPoolAdapter } from './smspool'
import { SmsBowerAdapter } from './smsbower'
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
  if (slug === 'smsbower') return new SmsBowerAdapter(apiKey)
  throw new Error(`Unknown provider: ${slug}`)
}

export { SmsBowerAdapter } from './smsbower'

export type { SmsProvider, OrderResult, PollResult } from './types'
