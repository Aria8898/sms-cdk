import { useState, useEffect } from 'react'
import { providersApi, servicesApi, poolApi, type Provider, type Service, type PoolCountry, type PoolStatusResult } from '../lib/api'

type TabValue = 'all' | 'qualified'

export default function PoolMonitor() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [result, setResult] = useState<PoolStatusResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabValue>('all')

  // 初始化：加载 providers 和 services
  useEffect(() => {
    async function init() {
      try {
        const [provData, svcData] = await Promise.all([
          providersApi.list(),
          servicesApi.list(),
        ])
        setProviders(provData)
        setServices(svcData)
        if (provData.length > 0) {
          const firstProvider = provData[0]
          setSelectedProviderId(firstProvider.id)
          const firstService = svcData.find(s => s.providerId === firstProvider.id)
          if (firstService) setSelectedServiceId(firstService.id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      }
    }
    init()
  }, [])

  // 切换 Provider 时重置 Service 选择
  function handleProviderChange(providerId: string) {
    setSelectedProviderId(providerId)
    setResult(null)
    setError('')
    const firstService = services.find(s => s.providerId === providerId)
    setSelectedServiceId(firstService?.id ?? '')
  }

  // 切换 Service 时清空结果
  function handleServiceChange(serviceId: string) {
    setSelectedServiceId(serviceId)
    setResult(null)
    setError('')
  }

  async function fetchPoolStatus() {
    if (!selectedServiceId) return
    setIsLoading(true)
    setError('')
    try {
      const data = await poolApi.status(selectedServiceId)
      setResult(data)
      setTab('all')
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredServices = services.filter(s => s.providerId === selectedProviderId)

  const displayCountries: PoolCountry[] = result
    ? tab === 'qualified'
      ? result.countries.filter(c => c.qualifies).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      : [...result.countries].sort((a, b) => {
          // 符合策略的在前，按 rank 排；不符合的在后，按成功率降序
          if (a.qualifies && !b.qualifies) return -1
          if (!a.qualifies && b.qualifies) return 1
          if (a.qualifies && b.qualifies) return (a.rank ?? 999) - (b.rank ?? 999)
          return b.successRate - a.successRate
        })
    : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">号池监控</h2>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-6">
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
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchPoolStatus}
          disabled={!selectedServiceId || isLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isLoading ? '查询中...' : '查询'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* 摘要卡片 */}
          <div className="grid grid-cols-4 gap-4 mb-6">
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
            {([['all', `全部 (${result.summary.total})`], ['qualified', `符合策略 (${result.summary.qualified})`]] as [TabValue, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  tab === value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
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
                      {tab === 'qualified' ? '当前没有符合策略的国家' : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  displayCountries.map(country => (
                    <tr key={country.countryId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{country.name}</td>
                      <td className="px-5 py-3 font-mono text-gray-500">{country.shortName}</td>
                      <td className="px-5 py-3 text-right">
                        <SuccessRateBar value={country.successRate} threshold={result.service.successRateThreshold} />
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-gray-700">
                        ${country.lowPrice.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        <StockBadge stock={country.stock} />
                      </td>
                      <td className="px-5 py-3">
                        <QualifyBadge
                          qualifies={country.qualifies}
                          rank={country.rank}
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
      )}

      {!result && !isLoading && !error && (
        <div className="py-16 text-center text-gray-400 text-sm">
          选择 Provider 和 Service 后点击「查询」
        </div>
      )}
    </div>
  )
}

function SuccessRateBar({ value, threshold }: { value: number; threshold: number }) {
  const passes = value >= threshold
  return (
    <div className="flex items-center justify-end gap-2">
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
  qualifies, rank, successRate, lowPrice, threshold, maxPrice
}: {
  qualifies: boolean
  rank: number | null
  successRate: number
  lowPrice: number
  threshold: number
  maxPrice: number
}) {
  if (qualifies) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
          符合策略
        </span>
        {rank !== null && rank <= 3 && (
          <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            优选 #{rank}
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
