import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { cdksApi, type Cdk } from '../lib/api'

type Tab = 'all' | 'active' | 'pending' | 'exhausted' | 'disabled'

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        可用
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
        使用中
      </span>
    )
  }
  if (status === 'disabled') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
        已停用
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      已用完
    </span>
  )
}

function UsageBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((remaining / total) * 100)
  const color = pct === 0 ? 'bg-gray-300' : pct < 30 ? 'bg-orange-400' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-500 text-xs">{remaining}/{total}</span>
    </div>
  )
}

export default function CdkList() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('all')
  const [cdks, setCdks] = useState<Cdk[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCdks() {
    setIsLoading(true)
    setError('')
    try {
      const data = await cdksApi.list()
      setCdks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCdks()
  }, [])

  const filtered = cdks.filter(c => {
    if (tab === 'active') return c.status === 'active'
    if (tab === 'pending') return c.hasPendingOrder === true
    if (tab === 'exhausted') return c.status === 'exhausted'
    if (tab === 'disabled') return c.status === 'disabled'
    return true
  })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all',       label: '全部' },
    { key: 'active',    label: '可用' },
    { key: 'pending',   label: '使用中' },
    { key: 'exhausted', label: '已用完' },
    { key: 'disabled',  label: '已停用' },
  ]

  async function handleDisable(id: string) {
    if (!window.confirm('确认停用该 CDK？停用后用户将无法使用。')) return
    try {
      const updated = await cdksApi.disable(id)
      setCdks(prev => prev.map(c => c.id === id ? updated : c))
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleEnable(id: string) {
    try {
      const updated = await cdksApi.enable(id)
      setCdks(prev => prev.map(c => c.id === id ? updated : c))
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('确认删除？此操作不可恢复。')) return
    try {
      await cdksApi.delete(id)
      setCdks(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">CDK 管理</h2>
        <button
          onClick={() => navigate('/cdks/generate')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          批量生成
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">加载中...</div>
      ) : error ? (
        <div className="py-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-medium text-gray-600">CDK 码</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">服务</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">国家</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">总次数</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">剩余次数</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">状态</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">创建时间</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    暂无数据
                  </td>
                </tr>
              ) : (
                filtered.map(cdk => {
                  const canDisable = cdk.status === 'active'
                  const canEnable  = cdk.status === 'disabled'
                  const canDelete  = cdk.hasPendingOrder === false && cdk.remainingUses === cdk.totalUses

                  // pending / exhausted 只显示查看详情，不显示停用/删除
                  const showActions = cdk.status !== 'pending' && cdk.status !== 'exhausted'

                  const actionButtons: React.ReactNode[] = []

                  actionButtons.push(
                    <button
                      key="detail"
                      onClick={() => navigate(`/cdks/${cdk.id}`)}
                      className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm transition-colors"
                    >
                      查看详情
                    </button>
                  )

                  if (showActions) {
                    if (canDisable) {
                      actionButtons.push(
                        <span key="sep-disable" className="text-gray-300 select-none">|</span>,
                        <button
                          key="disable"
                          onClick={() => handleDisable(cdk.id)}
                          className="text-orange-500 hover:bg-orange-50 px-2 py-1 rounded text-sm transition-colors"
                        >
                          停用
                        </button>
                      )
                    }

                    if (canEnable) {
                      actionButtons.push(
                        <span key="sep-enable" className="text-gray-300 select-none">|</span>,
                        <button
                          key="enable"
                          onClick={() => handleEnable(cdk.id)}
                          className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm transition-colors"
                        >
                          启用
                        </button>
                      )
                    }

                    if (canDelete) {
                      actionButtons.push(
                        <span key="sep-delete" className="text-gray-300 select-none">|</span>,
                        <button
                          key="delete"
                          onClick={() => handleDelete(cdk.id)}
                          className="text-red-500 hover:bg-red-50 px-2 py-1 rounded text-sm transition-colors"
                        >
                          删除
                        </button>
                      )
                    }
                  }

                  return (
                    <tr key={cdk.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-gray-800">{cdk.code}</td>
                      <td className="px-5 py-3 text-gray-600">{cdk.serviceName}</td>
                      <td className="px-5 py-3">
                        {cdk.countryCode ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                            {cdk.countryCode}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{cdk.totalUses}</td>
                      <td className="px-5 py-3">
                        <UsageBar remaining={cdk.remainingUses} total={cdk.totalUses} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={cdk.status} />
                      </td>
                      <td className="px-5 py-3 text-gray-600">{cdk.createdAt}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          {actionButtons}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
