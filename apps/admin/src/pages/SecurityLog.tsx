import { useState, useEffect } from 'react'
import { securityApi, type LoginAttempt } from '../lib/api'

export default function SecurityLog() {
  const [rows, setRows] = useState<LoginAttempt[]>([])
  const [stats, setStats] = useState({ total: 0, failures: 0 })
  const [failOnly, setFailOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(failFilter: boolean) {
    setIsLoading(true)
    setError('')
    try {
      const result = await securityApi.loginAttempts(failFilter)
      setRows(result.rows)
      setStats(result.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load(failOnly)
  }, [failOnly])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">安全日志</h2>
          <p className="text-sm text-gray-500 mt-0.5">登录尝试记录，可用于识别异常登录行为</p>
        </div>
        <button
          onClick={() => load(failOnly)}
          className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
        >
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">总尝试次数</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">失败次数</p>
          <p className="text-2xl font-semibold text-red-600">{stats.failures}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">成功次数</p>
          <p className="text-2xl font-semibold text-green-600">{stats.total - stats.failures}</p>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[{ key: false, label: '全部' }, { key: true, label: '仅失败' }].map(tab => (
          <button
            key={String(tab.key)}
            onClick={() => setFailOnly(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              failOnly === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
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
                <th className="text-left px-5 py-3 font-medium text-gray-600">IP 地址</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">结果</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-gray-400">
                    暂无记录
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-700 text-sm">{row.ipAddress}</td>
                    <td className="px-5 py-3">
                      {row.success ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          失败
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {new Date(row.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {rows.length > 0 && (
            <p className="text-xs text-gray-400 px-5 py-2 border-t border-gray-100">
              显示最近 {rows.length} 条记录
            </p>
          )}
        </div>
      )}
    </div>
  )
}
