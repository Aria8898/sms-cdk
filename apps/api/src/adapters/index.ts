import { SmsPoolAdapter } from './smspool'
import type { SmsProvider } from './types'

export function getProvider(slug: string, apiKey: string): SmsProvider {
  if (slug === 'smspool') return new SmsPoolAdapter(apiKey)
  throw new Error(`Unknown provider: ${slug}`)
}

export type { SmsProvider, OrderResult, PollResult } from './types'
