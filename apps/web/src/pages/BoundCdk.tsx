/**
 * 号码绑定型 CDK（Type C）独立页面
 * 三种状态：
 *   1. 未取号（CDK active）
 *   2. 已取号且有效（CDK exhausted + order active）
 *   3. 已过期（CDK exhausted + order expired）
 */

import { useState, useEffect, useRef } from 'react'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

// ─── API Types ───────────────────────────────────────────────────────────────

interface BoundActiveOrder {
  orderId: string
  phoneNumber: string | null
  codeApiUrl: string
  expiresAt: string | null
  boundAt: string | null
}

interface BoundValidateResult {
  cdkId: string
  cdkType: 'bound'
  // 未取号
  service?: { name: string }
  pools?: unknown[]
  remaining?: null
  total?: null
  // 已取号
  activeOrder?: BoundActiveOrder
}

interface BoundOrderResult {
  orderId: string
  phoneNumber: string
  codeApiUrl: string
  expiresAt: string
  boundAt: string
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function calcRemainingHours(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '—'
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return '已过期'
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return hours > 0 ? `约 ${hours} 小时 ${minutes} 分钟` : `约 ${minutes} 分钟`
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────

type PageState =
  | { kind: 'input' }
  | { kind: 'unbound'; cdkId: string; code: string }
  | { kind: 'active'; code: string; order: BoundActiveOrder }
  | { kind: 'expired'; expiredAt: string | null; boundAt: string | null }
  | { kind: 'error'; message: string }

export default function BoundCdk() {
  const [inputCode, setInputCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageState, setPageState] = useState<PageState>({ kind: 'input' })
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── 校验 CDK ──────────────────────────────────────────────────────────────

  async function handleValidate() {
    const code = inputCode.trim().toUpperCase()
    if (!code) return
    setLoading(true)

    try {
      const res = await fetch(`${BASE}/api/cdk/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json() as BoundValidateResult & { error?: string; expiredAt?: string; boundAt?: string }

      if (!res.ok) {
        if (data.expiredAt || (data.error && data.error.includes('过期'))) {
          setPageState({ kind: 'expired', expiredAt: data.expiredAt ?? null, boundAt: data.boundAt ?? null })
        } else {
          setPageState({ kind: 'error', message: data.error ?? `请求失败 (${res.status})` })
        }
        return
      }

      if (data.cdkType !== 'bound') {
        setPageState({ kind: 'error', message: '该 CDK 不是号码绑定型，请访问主页使用' })
        return
      }

      if (data.activeOrder) {
        // 已取号
        setPageState({ kind: 'active', code, order: data.activeOrder })
      } else {
        // 未取号
        setPageState({ kind: 'unbound', cdkId: data.cdkId, code })
      }
    } catch (err) {
      setPageState({ kind: 'error', message: err instanceof Error ? err.message : '网络错误，请重试' })
    } finally {
      setLoading(false)
    }
  }

  // ── 取号 ──────────────────────────────────────────────────────────────────

  async function handleTakeNumber() {
    if (pageState.kind !== 'unbound') return
    setLoading(true)

    try {
      const res = await fetch(`${BASE}/api/cdk/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cdkId: pageState.cdkId }),
      })
      const data = await res.json() as BoundOrderResult & { error?: string }

      if (!res.ok) {
        setPageState({ kind: 'error', message: data.error ?? `取号失败 (${res.status})` })
        return
      }

      setPageState({
        kind: 'active',
        code: pageState.code,
        order: {
          orderId: data.orderId,
          phoneNumber: data.phoneNumber,
          codeApiUrl: data.codeApiUrl,
          expiresAt: data.expiresAt,
          boundAt: data.boundAt,
        },
      })
    } catch (err) {
      setPageState({ kind: 'error', message: err instanceof Error ? err.message : '取号失败，请重试' })
    } finally {
      setLoading(false)
    }
  }

  // ── 复制接码链接 ──────────────────────────────────────────────────────────

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── 重新输入 ──────────────────────────────────────────────────────────────

  function handleReset() {
    setPageState({ kind: 'input' })
    setInputCode('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ─── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">号码绑定型接码</h1>
        <p className="text-sm text-gray-500 text-center mb-8">输入 CDK 查询或取号，获取专属接码链接</p>

        {/* 状态一：输入 CDK */}
        {(pageState.kind === 'input' || pageState.kind === 'error') && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CDK 码</label>
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleValidate()}
                placeholder="CDK-XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            {pageState.kind === 'error' && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {pageState.message}
              </div>
            )}

            <button
              onClick={handleValidate}
              disabled={loading || !inputCode.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? '查询中...' : '查询 / 取号'}
            </button>
          </div>
        )}

        {/* 状态一·取号确认：CDK 有效，尚未取号 */}
        {pageState.kind === 'unbound' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">CDK 有效，点击"立刻取号"获取专属号码</p>
              <p className="text-xs text-gray-400 mt-1">取号后 CDK 立即消耗，有效期至次日 07:00</p>
              <p className="font-mono text-xs text-gray-500 mt-2 bg-gray-50 px-3 py-1.5 rounded-lg">{pageState.code}</p>
            </div>

            <button
              onClick={handleTakeNumber}
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? '取号中...' : '立刻取号'}
            </button>

            <button onClick={handleReset} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              返回重新输入
            </button>
          </div>
        )}

        {/* 状态二：已取号，号码有效 */}
        {pageState.kind === 'active' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm font-medium text-green-700">号码有效</span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">手机号码</p>
                <p className="text-lg font-semibold text-gray-900 tracking-wide">{pageState.order.phoneNumber ?? '—'}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">接码 API</p>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <code className="flex-1 text-xs text-gray-700 break-all font-mono">{pageState.order.codeApiUrl}</code>
                  <button
                    onClick={() => handleCopy(pageState.order.codeApiUrl)}
                    className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>预计剩余有效期</span>
                <span className="font-medium text-gray-800">{calcRemainingHours(pageState.order.expiresAt)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>将于</span>
                <span className="font-medium text-gray-800">{formatDateTime(pageState.order.expiresAt)} 失效</span>
              </div>
              {pageState.order.boundAt && (
                <div className="flex justify-between text-gray-600">
                  <span>已于</span>
                  <span className="font-medium text-gray-800">{formatDateTime(pageState.order.boundAt)} 取号</span>
                </div>
              )}
            </div>

            <button onClick={handleReset} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              查询其他 CDK
            </button>
          </div>
        )}

        {/* 状态三：已过期 */}
        {pageState.kind === 'expired' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
              <span className="text-sm font-medium text-gray-500">号码已过期</span>
            </div>

            <div className="space-y-2 text-sm">
              {pageState.expiredAt && (
                <div className="flex justify-between text-gray-600">
                  <span>过期时间</span>
                  <span className="font-medium text-gray-800">{formatDateTime(pageState.expiredAt)}</span>
                </div>
              )}
              {pageState.boundAt && (
                <div className="flex justify-between text-gray-600">
                  <span>最后取号时间</span>
                  <span className="font-medium text-gray-800">{formatDateTime(pageState.boundAt)}</span>
                </div>
              )}
            </div>

            <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
              该号码已过期，无法继续接收验证码。如需继续使用，请联系管理员获取新的 CDK。
            </p>

            <button onClick={handleReset} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              查询其他 CDK
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
