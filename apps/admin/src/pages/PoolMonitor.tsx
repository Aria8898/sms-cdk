import { useState, useEffect } from 'react'
import {
  providersApi, servicesApi, poolApi,
  type Provider, type Service, type ServiceCategory,
  type PoolCountry, type BowerPosition, type PoolStatusResult,
} from '../lib/api'

// ─── 类型辅助 ─────────────────────────────────────────────────────────────────

interface FlatService extends Service {
  categoryName: string
}

function flattenCategories(cats: ServiceCategory[]): FlatService[] {
  return cats.flatMap(cat => cat.services.map(s => ({ ...s, categoryName: cat.name })))
}

type TabValue = 'all' | 'qualified' | 'blocked'

// ─── SessionStorage 缓存（按 serviceId 隔离，tab 关闭自动清除）────────────────

const STORAGE_KEY_LAST = 'pool-monitor-last'

function cacheKey(serviceId: string) {
  return `pool-monitor-cache-${serviceId}`
}

interface CachedEntry {
  result: PoolStatusResult
  queriedAt: string   // ISO string
}

function persistResult(serviceId: string, result: PoolStatusResult): void {
  try {
    const entry: CachedEntry = { result, queriedAt: new Date().toISOString() }
    sessionStorage.setItem(cacheKey(serviceId), JSON.stringify(entry))
  } catch {}
}

function restoreResult(serviceId: string): CachedEntry | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(serviceId))
    return raw ? (JSON.parse(raw) as CachedEntry) : null
  } catch { return null }
}

function persistSelection(providerId: string, serviceId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_LAST, JSON.stringify({ providerId, serviceId }))
  } catch {}
}

function restoreSelection(): { providerId: string; serviceId: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_LAST)
    return raw ? (JSON.parse(raw) as { providerId: string; serviceId: string }) : null
  } catch { return null }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// ─── Rank 说明卡片 ────────────────────────────────────────────────────────────

function RankLegend() {
  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">等级说明</p>
      <div className="flex gap-4 flex-wrap">
        {([
          { rank: 'Gold',   label: '金牌', range: '交付率 ≥ 80%', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
          { rank: 'Silver', label: '银牌', range: '交付率 60–79%', color: 'bg-gray-100 text-gray-600 border-gray-300' },
          { rank: 'Bronze', label: '铜牌', range: '交付率 < 60%',  color: 'bg-orange-100 text-orange-700 border-orange-300' },
        ] as const).map(({ label, range, color }) => (
          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${color}`}>
            <span className="font-semibold">{label}</span>
            <span className="text-xs opacity-80">{range}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-400">
          <span className="font-medium">—</span>
          <span className="text-xs">交付率未知（V3 降级）</span>
        </div>
      </div>
    </div>
  )
}

// ─── SMSBower 视图 ────────────────────────────────────────────────────────────

function BowerRankBadge({ rank }: { rank?: 'Gold' | 'Silver' | 'Bronze' }) {
  if (!rank) return <span className="text-gray-400 text-xs">—</span>
  const styles: Record<string, string> = {
    Gold:   'bg-yellow-100 text-yellow-800 border-yellow-300',
    Silver: 'bg-gray-100 text-gray-600 border-gray-300',
    Bronze: 'bg-orange-100 text-orange-700 border-orange-300',
  }
  const labels: Record<string, string> = { Gold: '金牌', Silver: '银牌', Bronze: '铜牌' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${styles[rank]}`}>
      {labels[rank]}
    </span>
  )
}

function BowerStrategyBadge({ pos, maxPrice }: { pos: BowerPosition; maxPrice: number }) {
  if (pos.blocked) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
        已屏蔽
      </span>
    )
  }
  if (pos.qualifies) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
        符合策略
      </span>
    )
  }
  const reasons: string[] = []
  if (pos.rank === 'Bronze') reasons.push('Bronze 兜底')
  if (pos.price > maxPrice) reasons.push(`价格超限 ($${pos.price.toFixed(3)} > $${maxPrice.toFixed(3)})`)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium">
        不符合
      </span>
      {reasons.map(r => (
        <span key={r} className="text-xs text-gray-400">{r}</span>
      ))}
    </div>
  )
}

function BowerView({ result }: {
  result: Extract<PoolStatusResult, { providerSlug: 'smsbower' }>
}) {
  const [tab, setTab] = useState<TabValue>('all')

  const displayPositions: BowerPosition[] = tab === 'qualified'
    ? result.positions.filter(p => p.qualifies)
    : tab === 'blocked'
    ? result.positions.filter(p => p.blocked).sort((a, b) => a.shortName.localeCompare(b.shortName))
    : result.positions  // 全部：使用后端已排序结果

  return (
    <>
      {/* V3 降级提示 */}
      {result.dataSource === 'v3' && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <span className="font-medium">注意</span>
          <span>当前数据来自降级路径（V3），交付率不可用，建议强制刷新重试</span>
        </div>
      )}

      {/* 摘要卡片 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">当前策略</div>
          <div className="text-sm font-medium text-gray-900">等级 Gold / Silver</div>
          <div className="text-sm font-medium text-gray-900">
            价格 ≤ ${result.service.maxPrice.toFixed(3)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">可用国家</div>
          <div className="text-2xl font-semibold text-gray-900">{result.summary.total}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">符合策略</div>
          <div className="text-2xl font-semibold text-green-600">{result.summary.qualified}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">已屏蔽</div>
          <div className="text-2xl font-semibold text-orange-500">{result.summary.blocked}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">优选国家（前3）</div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {result.summary.topPicks.length > 0
              ? result.summary.topPicks.map((p, i) => (
                  <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                    #{i + 1} {p}
                  </span>
                ))
              : <span className="text-sm text-gray-400">无</span>
            }
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          ['all',       `全部 (${result.summary.total})`],
          ['qualified', `符合策略 (${result.summary.qualified})`],
          ['blocked',   `已屏蔽 (${result.summary.blocked})`],
        ] as [TabValue, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 数据表格 */}
      {displayPositions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
          {tab === 'qualified' ? '当前没有符合策略的 position' : tab === 'blocked' ? '当前没有屏蔽的国家' : '暂无号池数据'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-medium text-gray-600">国家</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">等级</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">供应商 ID</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">库存</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">价格</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">策略状态</th>
              </tr>
            </thead>
            <tbody>
              {displayPositions.map((pos, i) => (
                <tr
                  key={i}
                  className={`border-b border-gray-100 transition-colors ${
                    pos.blocked ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{pos.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{pos.shortName}</div>
                  </td>
                  <td className="px-5 py-3">
                    <BowerRankBadge rank={pos.rank} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(pos.agentIds ?? []).map(id => (
                        <span key={id} className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {id}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <StockBadge stock={pos.stock ?? 0} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-gray-700">
                    ${(pos.price ?? 0).toFixed(3)}
                  </td>
                  <td className="px-5 py-3">
                    <BowerStrategyBadge pos={pos} maxPrice={result.service.maxPrice} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ─── SMSPool 视图（原有逻辑） ──────────────────────────────────────────────────

function SmsPoolView({ result }: {
  result: Extract<PoolStatusResult, { providerSlug: 'smspool' }>
}) {
  const [tab, setTab] = useState<TabValue>('all')

  const displayCountries: PoolCountry[] = tab === 'qualified'
    ? result.countries.filter(c => c.qualifies).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    : tab === 'blocked'
    ? result.countries.filter(c => c.blocked).sort((a, b) => a.shortName.localeCompare(b.shortName))
    : [...result.countries].sort((a, b) => {
        if (a.qualifies && !b.qualifies) return -1
        if (!a.qualifies && b.qualifies) return 1
        if (a.blocked && !b.blocked) return 1
        if (!a.blocked && b.blocked) return -1
        if (a.qualifies && b.qualifies) return (a.strategyRank ?? 999) - (b.strategyRank ?? 999)
        if (a.blocked && b.blocked) return a.shortName.localeCompare(b.shortName)
        return b.successRate - a.successRate
      })

  return (
    <>
      {/* 摘要卡片 */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">当前策略</div>
          <div className="text-sm font-medium text-gray-900">
            成功率 ≥ {result.service.successRateThreshold}%
          </div>
          <div className="text-sm font-medium text-gray-900">
            价格 ≤ ${result.service.maxPrice.toFixed(2)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">可用国家</div>
          <div className="text-2xl font-semibold text-gray-900">{result.summary.total}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">符合策略</div>
          <div className="text-2xl font-semibold text-green-600">{result.summary.qualified}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">已屏蔽</div>
          <div className="text-2xl font-semibold text-orange-500">{result.summary.blocked}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs text-gray-500 mb-1">优选国家（前3）</div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {result.summary.topPicks.length > 0
              ? result.summary.topPicks.map((p, i) => (
                  <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                    #{i + 1} {p}
                  </span>
                ))
              : <span className="text-sm text-gray-400">无</span>
            }
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          ['all',       `全部 (${result.summary.total})`],
          ['qualified', `符合策略 (${result.summary.qualified})`],
          ['blocked',   `已屏蔽 (${result.summary.blocked})`],
        ] as [TabValue, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-medium text-gray-600">国家</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">代码</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600">成功率</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600">最低价格</th>
              <th className="text-right px-5 py-3 font-medium text-gray-600">库存</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">策略状态</th>
            </tr>
          </thead>
          <tbody>
            {displayCountries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  {tab === 'qualified' ? '当前没有符合策略的国家'
                    : tab === 'blocked' ? '当前没有屏蔽的国家'
                    : '暂无数据'}
                </td>
              </tr>
            ) : (
              displayCountries.map(country => (
                <tr
                  key={String(country.countryId)}
                  className={`border-b border-gray-100 transition-colors ${
                    country.blocked ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-5 py-3 font-medium text-gray-900">{country.name}</td>
                  <td className="px-5 py-3 font-mono text-gray-500">{country.shortName}</td>
                  <td className="px-5 py-3 text-right">
                    <SuccessRateBar
                      value={country.successRate}
                      threshold={result.service.successRateThreshold}
                      dimmed={country.blocked}
                    />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-gray-700">
                    ${country.lowPrice.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">
                    <StockBadge stock={country.stock} />
                  </td>
                  <td className="px-5 py-3">
                    <QualifyBadge
                      blocked={country.blocked}
                      qualifies={country.qualifies}
                      strategyRank={country.strategyRank}
                      successRate={country.successRate}
                      lowPrice={country.lowPrice}
                      threshold={result.service.successRateThreshold}
                      maxPrice={result.service.maxPrice}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── PoolMonitor（主组件） ─────────────────────────────────────────────────────

export default function PoolMonitor() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [services, setServices] = useState<FlatService[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [result, setResult] = useState<PoolStatusResult | null>(null)
  const [queriedAt, setQueriedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      try {
        const [provData, cats] = await Promise.all([
          providersApi.list(),
          servicesApi.list(),
        ])
        const svcData = flattenCategories(cats)
        setProviders(provData)
        setServices(svcData)

        // 恢复上次选中的 provider / service，并加载对应缓存
        const last = restoreSelection()
        const validProvider = last && provData.find(p => p.id === last.providerId)
        const pid = validProvider ? last!.providerId : (provData[0]?.id ?? '')
        const validService = last && svcData.find(s => s.id === last.serviceId && s.providerId === pid)
        const sid = validService ? last!.serviceId : (svcData.find(s => s.providerId === pid)?.id ?? '')

        setSelectedProviderId(pid)
        setSelectedServiceId(sid)

        if (sid) {
          const cached = restoreResult(sid)
          if (cached) {
            setResult(cached.result)
            setQueriedAt(cached.queriedAt)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      }
    }
    init()
  }, [])

  function handleProviderChange(providerId: string) {
    setSelectedProviderId(providerId)
    setError('')
    const firstService = services.find(s => s.providerId === providerId)
    const sid = firstService?.id ?? ''
    setSelectedServiceId(sid)
    persistSelection(providerId, sid)

    const cached = sid ? restoreResult(sid) : null
    setResult(cached?.result ?? null)
    setQueriedAt(cached?.queriedAt ?? null)
  }

  function handleServiceChange(serviceId: string) {
    setSelectedServiceId(serviceId)
    setError('')
    persistSelection(selectedProviderId, serviceId)

    const cached = restoreResult(serviceId)
    setResult(cached?.result ?? null)
    setQueriedAt(cached?.queriedAt ?? null)
  }

  async function fetchPoolStatus(refresh = false) {
    if (!selectedServiceId) return
    refresh ? setIsRefreshing(true) : setIsLoading(true)
    setError('')
    try {
      const data = await poolApi.status(selectedServiceId, refresh)
      setResult(data)
      persistResult(selectedServiceId, data)
      persistSelection(selectedProviderId, selectedServiceId)
      setQueriedAt(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const filteredServices = services.filter(s => s.providerId === selectedProviderId)
  const selectedProvider = providers.find(p => p.id === selectedProviderId)
  const isBower = selectedProvider?.name?.toLowerCase().includes('smsbower')
    || result?.providerSlug === 'smsbower'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">号池监控</h2>
        {queriedAt && (
          <span className="text-xs text-gray-400">上次查询：{formatTime(queriedAt)}</span>
        )}
      </div>

      {/* Rank 说明（SMSBower 时显示） */}
      {isBower && <RankLegend />}

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Provider</label>
          <select
            value={selectedProviderId}
            onChange={e => handleProviderChange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
          >
            {providers.length === 0 && <option value="">暂无 Provider</option>}
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">Service</label>
          <select
            value={selectedServiceId}
            onChange={e => handleServiceChange(e.target.value)}
            disabled={filteredServices.length === 0}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[160px] disabled:opacity-50"
          >
            {filteredServices.length === 0 && <option value="">暂无 Service</option>}
            {filteredServices.map(s => (
              <option key={s.id} value={s.id}>{s.categoryName}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => fetchPoolStatus(false)}
          disabled={!selectedServiceId || isLoading || isRefreshing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isLoading ? '查询中...' : '查询'}
        </button>

        {/* 强制刷新（SMSBower 才有意义） */}
        {result?.providerSlug === 'smsbower' && (
          <button
            onClick={() => fetchPoolStatus(true)}
            disabled={isLoading || isRefreshing}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-sm font-medium rounded-lg transition-colors"
          >
            {isRefreshing ? '刷新中...' : '强制刷新'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        result.providerSlug === 'smsbower'
          ? <BowerView result={result} />
          : <SmsPoolView result={result} />
      )}

      {!result && !isLoading && !error && (
        <div className="py-16 text-center text-gray-400 text-sm">
          选择 Provider 和 Service 后点击「查询」
        </div>
      )}
    </div>
  )
}

// ─── 共用小组件 ───────────────────────────────────────────────────────────────

function SuccessRateBar({ value, threshold, dimmed }: { value: number; threshold: number; dimmed: boolean }) {
  const passes = value >= threshold
  return (
    <div className={`flex items-center justify-end gap-2 ${dimmed ? 'opacity-50' : ''}`}>
      <div className="w-20 bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${passes ? 'bg-green-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className={`text-sm font-medium w-10 text-right ${passes ? 'text-green-700' : 'text-red-600'}`}>
        {value}%
      </span>
    </div>
  )
}

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) return <span className="text-red-500 font-medium">0</span>
  if (stock < 10) return <span className="text-yellow-600 font-medium">{stock}</span>
  return <span className="text-gray-700">{stock}</span>
}

function QualifyBadge({
  blocked, qualifies, strategyRank, successRate, lowPrice, threshold, maxPrice,
}: {
  blocked: boolean; qualifies: boolean; strategyRank: number | null
  successRate: number; lowPrice: number; threshold: number; maxPrice: number
}) {
  if (blocked) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
        已屏蔽
      </span>
    )
  }
  if (qualifies) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
          符合策略
        </span>
        {strategyRank !== null && strategyRank <= 3 && (
          <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            优选 #{strategyRank}
          </span>
        )}
      </div>
    )
  }
  const reasons: string[] = []
  if (successRate < threshold) reasons.push(`成功率不足 (${successRate}% < ${threshold}%)`)
  if (lowPrice > maxPrice) reasons.push(`价格超限 ($${lowPrice.toFixed(2)} > $${maxPrice.toFixed(2)})`)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium">
        不符合
      </span>
      {reasons.map(r => (
        <span key={r} className="text-xs text-gray-400">{r}</span>
      ))}
    </div>
  )
}
