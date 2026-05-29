import { useState, useEffect, useRef } from 'react'
import { cdkApi, mockConfig } from '../lib/api'
import type { PoolOption, MockScenario } from '../lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'confirm' | 'waiting' | 'received' | 'success' | 'timeout'

interface SmsRecord {
  code: string
  sms: string
  receivedAt: string
}

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
  countryCode?: string
  pools?: PoolOption[]
  selectedServiceId?: string
  canRetry?: boolean
  secondsLeft?: number
  smsHistory: SmsRecord[]
  changeCount: number
}

const DEFAULT_DATA: FlowData = {
  cdk: '', cdkId: '', service: '',
  remaining: 0, total: 0, orderId: '',
  smsHistory: [], changeCount: 0,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToFlag(code: string): string {
  return [...code.toUpperCase()]
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 0x1F1A5))
    .join('')
}

const COUNTRY_NAMES: Record<string, string> = {
  US: '美国', GB: '英国', CN: '中国', JP: '日本', KR: '韩国',
  DE: '德国', FR: '法国', CA: '加拿大', AU: '澳大利亚', IN: '印度',
  BR: '巴西', RU: '俄罗斯', MX: '墨西哥', ID: '印度尼西亚', PH: '菲律宾',
  VN: '越南', NG: '尼日利亚', KE: '肯尼亚', SG: '新加坡', MY: '马来西亚',
}

function countryDisplay(code: string): string {
  const upper = code.toUpperCase()
  return `${isoToFlag(upper)} ${COUNTRY_NAMES[upper] ?? upper}专属`
}

const CDK_REGEX = /^[A-Z]{2}-(?:[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}|[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4})$/

function pad(n: number) { return String(n).padStart(2, '0') }

// ─── RegionA — CDK 输入 & 状态条 ─────────────────────────────────────────────
// idle：完整输入表单；其余阶段：紧凑信息条（输入框锁定）

interface RegionAProps {
  phase: Phase
  data: FlowData
  onValidate: (patch: Partial<FlowData>) => void
  onClear: () => void
}

function RegionA({ phase, data, onValidate, onClear }: RegionAProps) {
  const isIdle = phase === 'idle'
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
      const defaultPool = result.pools.find(p => p.isDefault && p.hasStock)
        ?? result.pools.find(p => p.hasStock)
        ?? result.pools[0]
      onValidate({
        cdk: inputValue.trim(),
        cdkId: result.cdkId,
        service: result.service.name,
        remaining: result.remaining,
        total: result.total,
        countryCode: result.countryCode,
        pools: result.pools,
        selectedServiceId: defaultPool?.serviceId,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '验证失败，请检查兑换码')
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  // ── idle：完整输入表单
  if (isIdle) {
    let borderClass = 'border-gray-200 focus:ring-indigo-400 focus:border-transparent'
    if (hasInput && isValid) borderClass = 'border-green-400 focus:ring-green-400 focus:border-transparent'
    else if (hasInput && !isValid) borderClass = 'border-red-400 focus:ring-red-400 focus:border-transparent'

    return (
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">兑换接码号码</h2>
        <p className="text-sm text-gray-400 mb-5">输入 CDK 兑换码，自动分配手机号码并接收验证码</p>

        <div className="space-y-3">
          <div>
            <input
              type="text"
              value={inputValue}
              onChange={e => { setInputValue(e.target.value.toUpperCase()); setErrorMsg('') }}
              onKeyDown={handleKeyDown}
              placeholder="OP-XXXX-XXXX-XXXX"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors font-mono tracking-wider ${borderClass}`}
              maxLength={17}
              disabled={isLoading}
            />
            {hasInput && isValid && !errorMsg && (
              <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                <span>✓</span> 格式正确
              </p>
            )}
            {hasInput && !isValid && (
              <p className="mt-1.5 text-xs text-red-500">✗ 格式不正确</p>
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading || !inputValue.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl text-sm transition-colors"
          >
            {isLoading ? '验证中...' : '立即兑换'}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-300 text-center">
          测试：
          <button
            onClick={() => setInputValue('OP-A3KF-9ZMR-B72X')}
            className="font-mono text-indigo-300 hover:text-indigo-500 underline underline-offset-2 transition-colors"
          >
            OP-A3KF-9ZMR-B72X
          </button>
        </p>
      </div>
    )
  }

  // ── 会话激活：紧凑信息条
  const dots = Array.from({ length: data.total }, (_, i) => i < data.remaining)

  return (
    <div className="bg-white rounded-2xl shadow-sm px-5 py-3.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-wrap min-w-0">
        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg tracking-wider shrink-0">
          {data.cdk}
        </span>
        <span className="text-sm font-medium text-gray-700 truncate">{data.service}</span>
        {data.countryCode && (
          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 shrink-0">
            {countryDisplay(data.countryCode)}
          </span>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {dots.map((active, i) => (
            <span key={i} className={`w-2 h-2 rounded-full ${active ? 'bg-indigo-500' : 'bg-gray-200'}`} />
          ))}
          <span className="text-xs text-gray-400 ml-0.5">{data.remaining}/{data.total}</span>
        </div>
      </div>
      <button
        onClick={onClear}
        className="text-xs text-gray-400 hover:text-gray-600 shrink-0 transition-colors"
      >
        清除
      </button>
    </div>
  )
}

// ─── ConfirmPanel — 运营商选择（Region B 初始内容）────────────────────────────

interface ConfirmPanelProps {
  data: FlowData
  onConfirm: (patch: Partial<FlowData>) => void
  onBack: () => void
}

function ConfirmPanel({ data, onConfirm, onBack }: ConfirmPanelProps) {
  const { pools = [] } = data
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const initialId = data.selectedServiceId
    ?? pools.find(p => p.isDefault && p.hasStock)?.serviceId
    ?? pools.find(p => p.hasStock)?.serviceId
    ?? pools[0]?.serviceId
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId)

  async function handleConfirm() {
    setIsLoading(true)
    setErrorMsg('')
    try {
      const result = await cdkApi.createOrder(data.cdkId, selectedId)
      onConfirm({
        orderId: result.orderId,
        phone: result.phoneNumber,
        expiresIn: result.expiresIn,
        secondsLeft: result.expiresIn,
        selectedServiceId: selectedId,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '取号失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-900">选择运营商并确认取号</h3>
        <p className="text-xs text-gray-400 mt-0.5">推荐运营商已自动选中，大多数情况下直接确认即可</p>
      </div>

      {pools.length > 0 && (
        <div className="space-y-2">
          {pools.map(pool => {
            const isSelected = pool.serviceId === selectedId
            const disabled = !pool.hasStock
            return (
              <button
                key={pool.serviceId}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSelectedId(pool.serviceId)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors ${
                  disabled
                    ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                    : isSelected
                      ? 'border-indigo-400 bg-indigo-50 text-gray-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    disabled ? 'border-gray-200' : isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                  }`}>
                    {isSelected && !disabled && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="font-medium">{pool.alias}</span>
                  {pool.isDefault && !disabled && (
                    <span className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium border border-emerald-100">
                      推荐
                    </span>
                  )}
                </div>
                {disabled && <span className="text-xs text-gray-300">暂无库存</span>}
              </button>
            )
          })}
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600">{errorMsg}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          返回
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading || !selectedId}
          className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {isLoading ? '取号中...' : '确认取号 →'}
        </button>
      </div>
    </div>
  )
}

// ─── SessionPanel — 双栏会话面板（管理倒计时 + 轮询）────────────────────────

interface SessionPanelProps {
  phase: Phase
  data: FlowData
  onPhaseChange: (phase: Phase, patch?: Partial<FlowData>) => void
}

function SessionPanel({ phase, data, onPhaseChange }: SessionPanelProps) {
  const [seconds, setSeconds] = useState(data.secondsLeft ?? data.expiresIn ?? 0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const secondsRef = useRef(seconds)
  const phaseRef = useRef(phase)
  const onPhaseChangeRef = useRef(onPhaseChange)
  const dataRef = useRef(data)

  useEffect(() => { secondsRef.current = seconds }, [seconds])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { onPhaseChangeRef.current = onPhaseChange }, [onPhaseChange])
  useEffect(() => { dataRef.current = data }, [data])

  // 当 retry 让 phase 回到 waiting 时，用 secondsLeft 重置计时
  useEffect(() => {
    if (phase === 'waiting' && data.secondsLeft !== undefined) {
      setSeconds(data.secondsLeft)
      secondsRef.current = data.secondsLeft
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 倒计时（waiting + received 阶段）
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'received') return

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          if (phaseRef.current === 'waiting') {
            onPhaseChangeRef.current('timeout')
          } else if (phaseRef.current === 'received') {
            // 倒计时归零：后台静默完成
            const orderId = dataRef.current.orderId
            cdkApi.finishOrder(orderId).catch(() => {}).finally(() => {
              onPhaseChangeRef.current('success')
            })
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 轮询（仅 waiting 阶段）
  useEffect(() => {
    if (phase !== 'waiting') return

    const orderId = data.orderId
    const interval = setInterval(async () => {
      try {
        const result = await cdkApi.pollOrder(orderId)
        if (result.status === 'received') {
          clearInterval(interval)
          const d = dataRef.current
          const newRecord: SmsRecord = {
            code: result.verificationCode ?? '',
            sms: result.smsContent ?? '',
            receivedAt: new Date().toISOString(),
          }
          onPhaseChangeRef.current('received', {
            sms: result.smsContent ?? '',
            code: result.verificationCode ?? '',
            canRetry: result.canRetry ?? false,
            secondsLeft: secondsRef.current,
            remaining: Math.max(0, d.remaining - 1),
            smsHistory: [newRecord, ...d.smsHistory],
          })
        } else if (result.status === 'completed') {
          clearInterval(interval)
          if (timerRef.current) clearInterval(timerRef.current)
          onPhaseChangeRef.current('success', {
            sms: result.smsContent ?? '',
            code: result.verificationCode ?? '',
          })
        } else if (result.status === 'expired' || result.status === 'cancelled') {
          clearInterval(interval)
          if (timerRef.current) clearInterval(timerRef.current)
          onPhaseChangeRef.current('timeout')
        }
      } catch {
        // 网络错误不中断，继续下次轮询
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [phase, data.orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PhoneCard
        phase={phase}
        data={data}
        seconds={seconds}
        onPhaseChange={onPhaseChange}
      />
      <CodeCard
        phase={phase}
        data={data}
        seconds={seconds}
        onPhaseChange={onPhaseChange}
        stopTimer={stopTimer}
      />
    </div>
  )
}

// ─── PhoneCard — 左栏：号码信息 & 状态 ───────────────────────────────────────

interface CardProps {
  phase: Phase
  data: FlowData
  seconds: number
  onPhaseChange: (phase: Phase, patch?: Partial<FlowData>) => void
  stopTimer?: () => void
}

function PhoneCard({ phase, data, seconds, onPhaseChange }: CardProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(data.phone ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isActive = phase === 'waiting' || phase === 'received'

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">

      {/* 监测状态指示器 */}
      <div className="flex items-center gap-2">
        {isActive ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
            <span className="text-xs text-green-600 font-medium">正在监测 {data.service} 短信</span>
          </>
        ) : phase === 'timeout' ? (
          <>
            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            <span className="text-xs text-orange-500 font-medium">等待超时</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
            <span className="text-xs text-indigo-600 font-medium">已完成</span>
          </>
        )}
      </div>

      {/* 手机号码 */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">分配的手机号码</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl font-mono font-bold text-gray-900 tracking-wide">{data.phone}</span>
          <button
            onClick={handleCopy}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              copied
                ? 'bg-green-50 border-green-200 text-green-600'
                : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600'
            }`}
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
        </div>
      </div>

      {/* 状态徽标 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-full border border-indigo-100">
          验证码: {data.smsHistory.length}/{data.total}次
        </span>
        <span className="text-xs bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full border border-gray-100">
          换号: {data.changeCount}/2次
        </span>
      </div>

      {/* 倒计时（waiting 阶段显示在左栏） */}
      {phase === 'waiting' && seconds > 0 && (
        <div className="flex items-center gap-2 text-orange-500">
          <span className="text-sm shrink-0">⏱</span>
          <span className="font-mono font-semibold tabular-nums text-sm">
            {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
          </span>
          <span className="text-xs text-gray-400">后超时</span>
        </div>
      )}

      <div className="flex-1" />

      {/* 超时：重新取号 */}
      {phase === 'timeout' && (
        <button
          onClick={() => onPhaseChange('confirm')}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          重新取号
        </button>
      )}

      {/* 完成：再次取号 */}
      {phase === 'success' && (
        <button
          onClick={() => onPhaseChange('confirm')}
          className="w-full py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 transition-colors"
        >
          再次取号
        </button>
      )}
    </div>
  )
}

// ─── CodeCard — 右栏：验证码展示 & 操作 ──────────────────────────────────────

function CodeCard({ phase, data, seconds, onPhaseChange, stopTimer }: CardProps) {
  const [codeCopied, setCodeCopied] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  function handleCopyCode() {
    navigator.clipboard.writeText(data.code ?? '').then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  async function handleRetry() {
    if (!data.orderId) return
    setIsRetrying(true)
    setErrorMsg('')
    stopTimer?.()
    try {
      await cdkApi.retryOrder(data.orderId)
      onPhaseChange('waiting', { secondsLeft: seconds })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '再发失败，请重试')
      setIsRetrying(false)
    }
  }

  async function handleFinish() {
    if (!data.orderId) return
    setIsFinishing(true)
    setErrorMsg('')
    stopTimer?.()
    try {
      await cdkApi.finishOrder(data.orderId)
      onPhaseChange('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '完成失败，请重试')
      setIsFinishing(false)
    }
  }

  async function handleRetryExchange() {
    if (!data.orderId) return
    setIsFinishing(true)
    stopTimer?.()
    try { await cdkApi.finishOrder(data.orderId) } catch { /* 静默忽略 */ }
    onPhaseChange('idle', { ...DEFAULT_DATA })
  }

  // ── waiting：等待动画
  if (phase === 'waiting') {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col items-center justify-center min-h-[220px] gap-4">
        <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
          <svg className="animate-spin w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">等待验证码...</p>
          <p className="text-xs text-gray-400 mt-0.5">每 5 秒自动检测一次</p>
        </div>
        {seconds > 0 && (
          <div className="text-center">
            <p className="text-3xl font-mono font-bold text-orange-500 tabular-nums">
              {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">剩余等待时间</p>
          </div>
        )}
      </div>
    )
  }

  // ── received：显示验证码
  if (phase === 'received') {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400 font-medium">验证码</p>
          {data.canRetry && seconds > 0 && (
            <span className="text-xs text-orange-500 font-mono tabular-nums">
              {pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}
            </span>
          )}
        </div>

        {/* 大号验证码 */}
        <div className="bg-indigo-50 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
          <span className="text-4xl font-mono font-bold text-indigo-600 tracking-[0.2em]">
            {data.code}
          </span>
          <button
            onClick={handleCopyCode}
            className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              codeCopied
                ? 'bg-green-100 text-green-600'
                : 'bg-white text-gray-500 hover:text-gray-700 shadow-sm border border-gray-100'
            }`}
          >
            {codeCopied ? '已复制 ✓' : '复制'}
          </button>
        </div>

        {/* 原始短信 */}
        {data.sms && (
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">原始短信</p>
            <p className="text-xs text-gray-600 leading-relaxed">{data.sms}</p>
          </div>
        )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <p className="text-xs text-red-600">{errorMsg}</p>
          </div>
        )}

        <div className="flex-1" />

        {/* 操作按钮 */}
        <div className="flex gap-2">
          {data.canRetry ? (
            <>
              <button
                onClick={handleRetry}
                disabled={isRetrying || isFinishing}
                className="flex-1 py-2.5 rounded-xl border border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRetrying
                  ? '请求中...'
                  : data.remaining > 0
                    ? `再发一条（剩 ${data.remaining} 次）`
                    : '再发一条'}
              </button>
              <button
                onClick={handleFinish}
                disabled={isRetrying || isFinishing}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {isFinishing ? '完成中...' : '完成'}
              </button>
            </>
          ) : (
            <button
              onClick={handleRetryExchange}
              disabled={isFinishing}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isFinishing ? '处理中...' : '再次兑换'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── success：展示最终验证码（只读）
  if (phase === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">兑换完成</p>
        </div>

        {data.code && (
          <>
            <div className="bg-indigo-50 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
              <span className="text-4xl font-mono font-bold text-indigo-600 tracking-[0.2em]">
                {data.code}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(data.code ?? '')}
                className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium bg-white text-gray-500 hover:text-gray-700 shadow-sm border border-gray-100 transition-colors"
              >
                复制
              </button>
            </div>
            {data.sms && (
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-400 mb-0.5">原始短信</p>
                <p className="text-xs text-gray-600 leading-relaxed">{data.sms}</p>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── timeout：超时提示
  if (phase === 'timeout') {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col items-center justify-center min-h-[220px] gap-3">
        <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center text-2xl">
          ⏱
        </div>
        <p className="text-sm font-medium text-gray-700">等待超时</p>
        <p className="text-xs text-gray-400 text-center leading-relaxed max-w-[200px]">
          未在有效时间内收到短信，CDK 次数不会被消耗
        </p>
      </div>
    )
  }

  return null
}

// ─── RegionC — 接收历史 ───────────────────────────────────────────────────────

function RegionC({ history }: { history: SmsRecord[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">接收记录</h3>
      <div>
        {history.map((record, i) => (
          <div
            key={i}
            className={`flex items-start gap-4 py-3 ${i < history.length - 1 ? 'border-b border-gray-50' : ''}`}
          >
            <span className="text-sm font-mono font-bold text-indigo-600 w-16 shrink-0">{record.code}</span>
            <span className="text-xs text-gray-500 flex-1 leading-relaxed">{record.sms}</span>
            <span className="text-xs text-gray-300 shrink-0 tabular-nums">
              {new Date(record.receivedAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MockPanel（仅开发模式渲染）──────────────────────────────────────────────

const SCENARIOS: { value: MockScenario; label: string; desc: string }[] = [
  { value: 'received',    label: 'received',    desc: 'waiting → received（主路径）' },
  { value: 'completed',   label: 'completed',   desc: 'waiting → success 直达' },
  { value: 'timeout',     label: 'timeout',     desc: 'waiting → timeout' },
  { value: 'create_fail', label: 'create_fail', desc: 'confirm 页取号失败' },
  { value: 'retry_fail',  label: 'retry_fail',  desc: 'received 页再发失败' },
  { value: 'finish_fail', label: 'finish_fail', desc: 'received 页完成失败' },
]

function MockPanel() {
  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [scenario, setScenario] = useState<MockScenario>('received')
  const [delaySec, setDelaySec] = useState(3)
  const [canRetry, setCanRetry] = useState(true)

  useEffect(() => {
    mockConfig.enabled = enabled
    mockConfig.scenario = scenario
    mockConfig.delayMs = delaySec * 1000
    mockConfig.canRetry = canRetry
  }, [enabled, scenario, delaySec, canRetry])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Mock 控制台"
        className={`fixed bottom-4 right-4 w-10 h-10 rounded-full shadow-lg flex items-center justify-center text-base transition-colors z-50 ${
          enabled ? 'bg-amber-400 hover:bg-amber-500' : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        🧪
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">🧪 Mock 控制台</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Mock 模式</span>
          <button
            onClick={() => setEnabled(v => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-amber-400' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {enabled && (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">场景</p>
              <div className="space-y-1">
                {SCENARIOS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setScenario(s.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      scenario === s.value
                        ? 'bg-amber-50 border border-amber-300 text-amber-800'
                        : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="font-mono font-semibold">{s.label}</span>
                    <span className="ml-1.5 text-gray-400">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {scenario !== 'create_fail' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">延迟</p>
                  <span className="text-xs font-mono text-gray-700">{delaySec}s</span>
                </div>
                <input
                  type="range" min={1} max={15} value={delaySec}
                  onChange={e => setDelaySec(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>
            )}

            {scenario === 'received' && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">canRetry</span>
                <button
                  onClick={() => setCanRetry(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${canRetry ? 'bg-indigo-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${canRetry ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Home — 页面状态管理器 ────────────────────────────────────────────────────

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [data, setData] = useState<FlowData>(DEFAULT_DATA)

  function updatePhase(newPhase: Phase, patch?: Partial<FlowData>) {
    if (patch) setData(prev => ({ ...prev, ...patch }))
    setPhase(newPhase)
  }

  function handleClear() {
    setPhase('idle')
    setData(DEFAULT_DATA)
  }

  const showSession = phase === 'waiting' || phase === 'received' || phase === 'success' || phase === 'timeout'

  return (
    <div className="space-y-4">
      {/* 区域 A：CDK 输入 & 状态条 */}
      <RegionA
        phase={phase}
        data={data}
        onValidate={patch => updatePhase('confirm', patch)}
        onClear={handleClear}
      />

      {/* 区域 B：运营商选择（confirm 阶段）*/}
      {phase === 'confirm' && (
        <ConfirmPanel
          data={data}
          onConfirm={patch => updatePhase('waiting', patch)}
          onBack={() => updatePhase('idle')}
        />
      )}

      {/* 区域 B：双栏会话面板（waiting / received / success / timeout）*/}
      {showSession && (
        <SessionPanel
          phase={phase}
          data={data}
          onPhaseChange={updatePhase}
        />
      )}

      {/* 区域 C：接收历史（收到第一条短信后展开）*/}
      {data.smsHistory.length > 0 && (
        <RegionC history={data.smsHistory} />
      )}

      {import.meta.env.DEV && <MockPanel />}
    </div>
  )
}
