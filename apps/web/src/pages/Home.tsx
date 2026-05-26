import { useState, useEffect, useRef } from 'react'
import { cdkApi } from '../lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'input' | 'confirm' | 'waiting' | 'success' | 'timeout' | 'error'

interface FlowData {
  cdk: string
  cdkId: string
  service: string
  remaining: number
  total: number
  orderId: string
  phone?: string
  expiresIn?: number
  sms?: string
  code?: string
  errorType?: 'invalid' | 'exhausted' | 'unknown'
}

type GoTo = (nextStep: Step, patch?: Partial<FlowData>) => void

interface StepProps {
  data: FlowData
  goTo: GoTo
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CDK_REGEX = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

function pad(n: number) {
  return String(n).padStart(2, '0')
}

const DEFAULT_DATA: FlowData = {
  cdk: '',
  cdkId: '',
  service: '',
  remaining: 0,
  total: 0,
  orderId: '',
}

// ─── StepInput ───────────────────────────────────────────────────────────────

function StepInput({ data, goTo }: StepProps) {
  const [inputValue, setInputValue] = useState(data.cdk)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isValid = CDK_REGEX.test(inputValue)
  const hasInput = inputValue.trim().length > 0

  async function handleSubmit() {
    if (!inputValue.trim()) return
    setIsLoading(true)
    setErrorMsg('')
    try {
      const result = await cdkApi.validate(inputValue.trim())
      goTo('confirm', {
        cdk: inputValue.trim(),
        cdkId: result.cdkId,
        service: result.service.name,
        remaining: result.remaining,
        total: result.total,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '验证失败')
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  let borderClass = 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
  if (hasInput && isValid) borderClass = 'border-green-500 focus:ring-green-500 focus:border-transparent'
  else if (hasInput && !isValid) borderClass = 'border-red-400 focus:ring-red-400 focus:border-transparent'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">兑换号码</h2>
      <p className="text-sm text-gray-500 mb-6">输入 CDK 兑换码，获取一次性接码号码</p>

      <div className="space-y-4">
        <div>
          <input
            type="text"
            value={inputValue}
            onChange={e => { setInputValue(e.target.value.toUpperCase()); setErrorMsg('') }}
            onKeyDown={handleKeyDown}
            placeholder="如 OP-XXXX-XXXX-XXXX"
            className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors font-mono tracking-wider ${borderClass}`}
            maxLength={17}
            disabled={isLoading}
          />
          {hasInput && isValid && !errorMsg && (
            <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
              <span>✓</span> 格式正确
            </p>
          )}
          {hasInput && !isValid && (
            <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
              <span>✗</span> 格式不正确
            </p>
          )}
        </div>

        {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

        <button
          onClick={handleSubmit}
          disabled={isLoading || !inputValue.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors"
        >
          {isLoading ? '验证中...' : '立即兑换'}
        </button>
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center">
        测试用 CDK：
        <button
          onClick={() => setInputValue('OP-A3KF-9ZMR-B72X')}
          className="font-mono text-blue-400 hover:text-blue-600 underline underline-offset-2 transition-colors"
        >
          OP-A3KF-9ZMR-B72X
        </button>
      </p>
    </div>
  )
}

// ─── StepConfirm ─────────────────────────────────────────────────────────────

function StepConfirm({ data, goTo }: StepProps) {
  const { cdk, service, remaining, total } = data
  const dots = Array.from({ length: total }, (_, i) => i < remaining)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleConfirm() {
    setIsLoading(true)
    setErrorMsg('')
    try {
      const result = await cdkApi.createOrder(data.cdkId)
      goTo('waiting', {
        orderId: result.orderId,
        phone: result.phoneNumber,
        expiresIn: result.expiresIn,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '取号失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">确认兑换</h2>
        <p className="text-sm text-gray-500">请确认以下信息后再继续</p>
      </div>

      {/* CDK */}
      <div className="space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">兑换码</p>
        <span className="inline-block font-mono text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md border border-gray-200 tracking-widest">
          {cdk}
        </span>
      </div>

      {/* Service */}
      <div className="space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">适用服务</p>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-gray-800">{service}</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium border border-blue-200">
            接码服务
          </span>
        </div>
      </div>

      {/* Remaining */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">可用次数</p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">
            {remaining} / {total} 次可用
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {dots.map((active, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                active ? 'bg-blue-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-600">{errorMsg}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => goTo('input')}
          className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          返回
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isLoading ? '取号中...' : '确认兑换'}
        </button>
      </div>
    </div>
  )
}

// ─── StepWaiting ─────────────────────────────────────────────────────────────

function StepWaiting({ data, goTo }: StepProps) {
  const { phone, service, expiresIn } = data
  const [copied, setCopied] = useState(false)
  const [seconds, setSeconds] = useState(expiresIn ?? 0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          goTo('timeout')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await cdkApi.pollOrder(data.orderId)
        if (result.status === 'completed') {
          clearInterval(interval)
          goTo('success', {
            sms: result.smsContent ?? '',
            code: result.verificationCode ?? '',
          })
        } else if (result.status === 'expired' || result.status === 'cancelled') {
          clearInterval(interval)
          goTo('timeout')
        }
        // pending: 继续等待
      } catch {
        // 网络错误不中断，继续下次轮询
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [data.orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60

  function handleCopy() {
    navigator.clipboard.writeText(phone ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleSimulate() {
    if (timerRef.current) clearInterval(timerRef.current)
    goTo('success', {
      sms: 'Your OpenAI verification code is 847291. Do not share it.',
      code: '847291',
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">服务</p>
        <h2 className="text-xl font-semibold text-gray-900">{service}</h2>
      </div>

      {/* Phone */}
      <div className="space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">分配的号码</p>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-mono font-semibold text-gray-900 tracking-wider">
            {phone}
          </span>
          <button
            onClick={handleCopy}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors font-medium ${
              copied
                ? 'bg-green-50 border-green-300 text-green-600'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
        </div>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
        <span className="text-orange-500 text-lg">🕐</span>
        <div>
          <p className="text-xs text-orange-600 font-medium">剩余时间</p>
          <p className="text-2xl font-mono font-bold text-orange-500 tabular-nums">
            {pad(minutes)}:{pad(secs)}
          </p>
        </div>
      </div>

      {/* Loading animation */}
      <div className="flex items-center gap-3">
        <svg
          className="animate-spin h-5 w-5 text-blue-500 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm text-gray-600">等待短信中...</span>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">接码进度</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-base">✅</span>
            <span className="text-sm text-gray-700">号码已分配</span>
          </div>
          <div className="ml-[11px] w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-3">
            <span className="text-base">⏳</span>
            <span className="text-sm font-semibold text-blue-600">等待短信</span>
            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
              当前
            </span>
          </div>
          <div className="ml-[11px] w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-3">
            <span className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
            <span className="text-sm text-gray-400">接收完成</span>
          </div>
        </div>
      </div>

      {/* Simulate button */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={handleSimulate}
          className="w-full py-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs font-medium transition-colors"
        >
          模拟收到短信（测试）
        </button>
      </div>
    </div>
  )
}

// ─── StepSuccess ─────────────────────────────────────────────────────────────

function StepSuccess({ data, goTo }: StepProps) {
  const { phone, service, sms, code } = data
  const [copied, setCopied] = useState(false)

  function handleCopyCode() {
    navigator.clipboard.writeText(code ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* Success header */}
      <div className="flex flex-col items-center text-center py-2">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
          <svg
            className="w-7 h-7 text-green-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">短信已接收</h2>
        <p className="text-sm text-gray-500 mt-1">{service} 验证码已成功获取</p>
      </div>

      {/* Phone */}
      <div className="space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">接码号码</p>
        <p className="text-sm font-mono text-gray-500">{phone}</p>
      </div>

      {/* SMS content */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">短信内容</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed">{sms}</p>
        </div>
      </div>

      {/* Verification code */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">验证码</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-blue-600 rounded-lg px-5 py-3 flex items-center justify-center">
            <span className="text-3xl font-mono font-bold text-white tracking-[0.25em]">
              {code}
            </span>
          </div>
          <button
            onClick={handleCopyCode}
            className={`flex-shrink-0 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
              copied
                ? 'bg-green-50 border-green-300 text-green-600'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {copied ? '已复制 ✓' : '复制验证码'}
          </button>
        </div>
      </div>

      {/* Action */}
      <div className="pt-2">
        <button
          onClick={() => goTo('input', { ...DEFAULT_DATA })}
          className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          再兑换一次
        </button>
      </div>
    </div>
  )
}

// ─── StepTimeout ─────────────────────────────────────────────────────────────

function StepTimeout({ data, goTo }: StepProps) {
  const { cdk, remaining, total } = data
  const dots = Array.from({ length: total }, (_, i) => i < remaining)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center py-2">
        <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mb-3">
          <span className="text-2xl">🕐</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">号码已超时</h2>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-xs">
          未在有效时间内收到短信，CDK 次数不会被消耗。
        </p>
      </div>

      {/* CDK info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-4 space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">兑换码</p>
          <span className="font-mono text-sm text-gray-700 tracking-widest">{cdk}</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">剩余次数</p>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800">
              {remaining} / {total} 次可用
            </span>
            <div className="flex items-center gap-1.5">
              {dots.map((active, i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${
                    active ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => goTo('input')}
          className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          返回首页
        </button>
        <button
          onClick={() => goTo('confirm')}
          className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          重新获取号码
        </button>
      </div>
    </div>
  )
}

// ─── StepError ───────────────────────────────────────────────────────────────

const ERROR_CONFIG: Record<string, { title: string; description: string }> = {
  invalid: {
    title: 'CDK 无效',
    description: '请检查兑换码是否正确',
  },
  exhausted: {
    title: 'CDK 已用完',
    description: '该兑换码的可用次数已耗尽',
  },
  unknown: {
    title: '出现错误',
    description: '请稍后重试',
  },
}

function StepError({ data, goTo }: StepProps) {
  const type = data.errorType ?? 'unknown'
  const config = ERROR_CONFIG[type] ?? ERROR_CONFIG.unknown

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center py-2">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <svg
            className="w-7 h-7 text-red-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{config.title}</h2>
        <p className="text-sm text-gray-500 mt-2">{config.description}</p>
      </div>

      {/* Error type badge */}
      <div className="flex justify-center">
        <span className="text-xs bg-red-50 text-red-500 border border-red-200 px-3 py-1 rounded-full font-medium">
          错误代码：{type}
        </span>
      </div>

      {/* Action */}
      <div className="pt-2">
        <button
          onClick={() => goTo('input')}
          className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          返回首页
        </button>
      </div>
    </div>
  )
}

// ─── Home (步骤状态管理器) ────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<Step>('input')
  const [data, setData] = useState<FlowData>(DEFAULT_DATA)

  const goTo: GoTo = (nextStep, patch) => {
    if (patch) setData(prev => ({ ...prev, ...patch }))
    setStep(nextStep)
  }

  return (
    <>
      {step === 'input'   && <StepInput   data={data} goTo={goTo} />}
      {step === 'confirm' && <StepConfirm data={data} goTo={goTo} />}
      {step === 'waiting' && <StepWaiting data={data} goTo={goTo} />}
      {step === 'success' && <StepSuccess data={data} goTo={goTo} />}
      {step === 'timeout' && <StepTimeout data={data} goTo={goTo} />}
      {step === 'error'   && <StepError   data={data} goTo={goTo} />}
    </>
  )
}
