/**
 * yamasakisms 适配器
 * 实现 BoundSmsProvider 接口，管理 access_token 持久化，处理 MD5 签名。
 *
 * API Base: https://api.yamasakisms.com
 * 签名规则：将非空参数按 key 字典排序后拼接 key=value&...，追加 api_key，取 MD5 十六进制值。
 */

import { eq } from 'drizzle-orm'
import { getDb, providerTokens } from '../db'
import type { BoundSmsProvider } from './types'

const API_BASE = 'https://api.yamasakisms.com'
const PROVIDER_SLUG = 'yamasakisms'

// ─── MD5 纯 JS 实现（CF Workers 不支持 crypto.subtle MD5）────────────────────

function md5hex(str: string): string {
  // Encode string to UTF-8 bytes
  const enc = new TextEncoder()
  const bytes = enc.encode(str)

  const origLen = bytes.length
  // Pad to a multiple of 64 bytes: append 0x80, zeros, then 8-byte little-endian bit length
  const padLen = ((origLen + 8) >> 6) + 1
  const padded = new Uint8Array(padLen * 64)
  padded.set(bytes)
  padded[origLen] = 0x80
  const bitLen = origLen * 8
  // 64-bit little-endian length (low 32 bits; high 32 assumed 0 for practical message lengths)
  padded[padLen * 64 - 8] = bitLen & 0xff
  padded[padLen * 64 - 7] = (bitLen >>> 8) & 0xff
  padded[padLen * 64 - 6] = (bitLen >>> 16) & 0xff
  padded[padLen * 64 - 5] = (bitLen >>> 24) & 0xff

  // Interpret as little-endian 32-bit words
  const numWords = padded.length / 4
  const M = new Uint32Array(numWords)
  for (let i = 0; i < numWords; i++) {
    const off = i * 4
    M[i] = (padded[off] | (padded[off + 1] << 8) | (padded[off + 2] << 16) | (padded[off + 3] << 24)) >>> 0
  }

  // Precomputed T[i] = floor(abs(sin(i+1)) * 2^32)
  const T = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ])

  const shifts = [
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
    5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,
  ]

  let a0 = 0x67452301 >>> 0
  let b0 = 0xefcdab89 >>> 0
  let c0 = 0x98badcfe >>> 0
  let d0 = 0x10325476 >>> 0

  for (let blk = 0; blk < numWords; blk += 16) {
    let A = a0, B = b0, C = c0, D = d0

    for (let j = 0; j < 64; j++) {
      let F: number, g: number
      if (j < 16) {
        F = ((B & C) | (~B & D)) >>> 0
        g = j
      } else if (j < 32) {
        F = ((D & B) | (~D & C)) >>> 0
        g = (5 * j + 1) % 16
      } else if (j < 48) {
        F = (B ^ C ^ D) >>> 0
        g = (3 * j + 5) % 16
      } else {
        F = (C ^ (B | ~D)) >>> 0
        g = (7 * j) % 16
      }
      const temp = D
      D = C
      C = B
      const s = shifts[j]
      const sum = (A + F + M[blk + g] + T[j]) >>> 0
      B = ((B + ((sum << s) | (sum >>> (32 - s)))) >>> 0)
      A = temp
    }

    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  // Little-endian hex output
  function le32hex(n: number): string {
    const b = [(n & 0xff), ((n >>> 8) & 0xff), ((n >>> 16) & 0xff), ((n >>> 24) & 0xff)]
    return b.map(x => x.toString(16).padStart(2, '0')).join('')
  }

  return le32hex(a0) + le32hex(b0) + le32hex(c0) + le32hex(d0)
}

// ─── 签名生成 ─────────────────────────────────────────────────────────────────

function generateSign(params: Record<string, string | number>, apiKey: string): string {
  const keys = Object.keys(params).filter(k => {
    const v = params[k]
    return v !== null && v !== undefined && v !== ''
  }).sort()

  const paramStr = keys.map(k => `${k}=${params[k]}`).join('&')
  return md5hex(paramStr + apiKey)
}

// ─── HTTP 请求封装 ─────────────────────────────────────────────────────────────

interface YamasakismsResponse<T = unknown> {
  code: number
  msg: string
  data?: T
}

async function post<T>(
  path: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000)
  const allParams = { ...params, timestamp }
  const sign = generateSign(allParams, apiKey)

  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(allParams)) {
    body.set(k, String(v))
  }
  body.set('sign', sign)

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  if (!res.ok) {
    throw new Error(`yamasakisms HTTP ${res.status}: ${path}`)
  }

  const json = await res.json() as YamasakismsResponse<T>
  console.log(`[yamasakisms] ${path} request params:`, JSON.stringify(allParams))
  console.log(`[yamasakisms] ${path} raw response:`, JSON.stringify(json))
  // code=0 和 code=1 均视为成功（yamasakisms 部分接口用 code=0+msg="ok" 表示成功）
  if (json.code === 1 || json.code === 0) {
    // 空数组 + msg 含"过期/授权/token"= token 失效，抛特殊错误触发重试
    const msg = json.msg ?? ''
    if (Array.isArray(json.data) && (json.data as unknown[]).length === 0
      && (msg.includes('过期') || msg.includes('授权') || msg.toLowerCase().includes('token'))) {
      throw new Error(`YAMASAKISMS_TOKEN_EXPIRED: ${msg}`)
    }
    return json.data as T
  }
  throw new Error(`yamasakisms [code=${json.code}]: ${json.msg ?? '未知错误'}`)
}

// ─── Token 管理 ───────────────────────────────────────────────────────────────

interface AuthResponse {
  access_token: string
  expires_in: number
}

export class YamasakismsAdapter implements BoundSmsProvider {
  private readonly db: ReturnType<typeof getDb>

  constructor(
    d1: D1Database,
    private readonly userId: string,
    private readonly userCode: string,
    private readonly apiKey: string,
  ) {
    this.db = getDb(d1)
  }

  /** 清除 DB 中存储的 token，强制下次重新登录 */
  private async clearToken(): Promise<void> {
    await this.db
      .update(providerTokens)
      .set({ expiresAt: '1970-01-01T00:00:00.000Z' })
      .where(eq(providerTokens.providerSlug, PROVIDER_SLUG))
      .catch(() => {})
  }

  /**
   * 带 token 过期自动重试的 post 封装。
   * 若 API 返回 token 过期错误，清除旧 token 并重新登录后重试一次。
   */
  private async postAuthenticated<T>(
    path: string,
    extraParams: Record<string, string | number>,
  ): Promise<T> {
    const token = await this.getToken()
    try {
      return await post<T>(path, { usercode: this.userCode, access_token: token, ...extraParams }, this.apiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.startsWith('YAMASAKISMS_TOKEN_EXPIRED')) {
        console.log('[yamasakisms] token expired, re-authenticating...')
        await this.clearToken()
        const newToken = await this.getToken()
        return post<T>(path, { usercode: this.userCode, access_token: newToken, ...extraParams }, this.apiKey)
      }
      throw err
    }
  }

  /** 获取有效的 access_token，必要时自动重新登录 */
  private async getToken(): Promise<string> {
    const [row] = await this.db
      .select()
      .from(providerTokens)
      .where(eq(providerTokens.providerSlug, PROVIDER_SLUG))

    const now = new Date().toISOString()

    if (row && row.expiresAt > now) {
      return row.accessToken
    }

    // Token 过期或不存在，重新登录
    const authData = await this.login()
    const expiresAt = new Date(Date.now() + authData.expires_in * 1000).toISOString()
    const updatedAt = now

    await this.db
      .insert(providerTokens)
      .values({
        providerSlug: PROVIDER_SLUG,
        accessToken: authData.access_token,
        expiresAt,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: providerTokens.providerSlug,
        set: { accessToken: authData.access_token, expiresAt, updatedAt },
      })

    return authData.access_token
  }

  /** 调用 yamasakisms 登录接口 */
  private async login(): Promise<AuthResponse> {
    const timestamp = Math.floor(Date.now() / 1000)
    const params: Record<string, string | number> = {
      id: this.userId,
      usercode: this.userCode,
      timestamp,
    }
    const sign = generateSign(params, this.apiKey)

    const body = new URLSearchParams()
    body.set('id', this.userId)
    body.set('usercode', this.userCode)
    body.set('timestamp', String(timestamp))
    body.set('sign', sign)

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      body: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (!res.ok) {
      throw new Error(`yamasakisms login HTTP ${res.status}`)
    }

    const json = await res.json() as YamasakismsResponse<AuthResponse>
    if (!json.data?.access_token) {
      throw new Error(`yamasakisms login failed: ${json.msg}`)
    }

    return json.data
  }

  // ─── BoundSmsProvider 实现 ─────────────────────────────────────────────────

  async takeNumber(platformId: string): Promise<{ orderNo: string; phoneNumber: string }> {
    // API 返回 data=[order_no_integer] 格式
    const raw = await this.postAuthenticated<number[] | { order_no?: string; phone_number?: string }>(
      '/api/auth/takesmsphonenumber',
      { platform_id: platformId, take_count: 1 },
    )

    // data 为空数组 = 库存不足
    if (Array.isArray(raw) && raw.length === 0) {
      throw new Error('库存不足，暂无可用号码')
    }

    // data=[order_no] 格式：取第一个元素作为 order_no
    let orderNo: string
    if (Array.isArray(raw)) {
      orderNo = String(raw[0])
    } else if (raw && typeof raw === 'object' && 'order_no' in raw && raw.order_no) {
      orderNo = raw.order_no
    } else {
      throw new Error(`takeNumber: 无法解析响应，data=${JSON.stringify(raw)}`)
    }

    // API 文档中没有单独获取手机号的接口，phone_number 将在首次 getphonecode 有数据时获取
    return { orderNo, phoneNumber: '' }
  }

  async getLatestCode(orderNo: string): Promise<{ code: string; codeTime: string; phoneNumber?: string } | null> {
    interface GetCodeResponse {
      sms_content?: string
      sms_time?: string
      code?: string
      code_time?: string
      // 手机号可能出现在有数据的响应里
      phone?: string
      mobile?: string
      phone_number?: string
      [key: string]: unknown
    }

    const raw = await this.postAuthenticated<GetCodeResponse | GetCodeResponse[]>(
      '/api/auth/getphonecode',
      { order_no: orderNo },
    )

    // data 为空数组或 null = 暂无验证码
    const data = Array.isArray(raw) ? (raw.length > 0 ? raw[0] : null) : raw
    if (!data) return null

    const code = data.code ?? data.sms_content
    const codeTime = data.code_time ?? data.sms_time
    const phoneNumber = data.phone_number ?? data.phone ?? data.mobile

    if (!code) return null

    return {
      code,
      codeTime: codeTime ?? new Date().toISOString(),
      ...(phoneNumber ? { phoneNumber: String(phoneNumber) } : {}),
    }
  }

  async getBalance(): Promise<{ balance: number; currency: string }> {
    interface BalanceResponse {
      balance?: number | string
      currency?: string
      [key: string]: unknown
    }
    const raw = await this.postAuthenticated<BalanceResponse | BalanceResponse[]>(
      '/api/auth/balance',
      {},
    )
    const data = Array.isArray(raw) ? (raw[0] ?? {}) : (raw ?? {})
    return {
      balance: Number((data as BalanceResponse).balance ?? 0),
      currency: String((data as BalanceResponse).currency ?? 'CNY'),
    }
  }

  async getPlatformInfo(): Promise<unknown[]> {
    const data = await this.postAuthenticated<unknown[] | unknown>(
      '/api/auth/platforminfo',
      { platform_type: 'sms' },
    )
    return Array.isArray(data) ? data : (data ? [data] : [])
  }

  async releaseNumber(orderNo: string): Promise<void> {
    await this.postAuthenticated(
      '/api/auth/freedsmsphonenumber',
      { order_no: orderNo },
    ).catch(() => {
      // 释放失败不影响主流程，静默处理
    })
  }
}
