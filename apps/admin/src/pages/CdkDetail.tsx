import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { cdksApi, type CdkDetail as CdkDetailType, type Order } from '../lib/api'

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        可用
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
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
        使用中
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      已用完
    </span>
  )
}

function ResultBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        成功
      </span>
    )
  }
  if (status === 'timeout') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
        超时
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
        进行中
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      取消
    </span>
  )
}

export default function CdkDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<CdkDetailType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    async function loadDetail() {
      setIsLoading(true)
      setError('')
      try {
        const data = await cdksApi.detail(id!)
        setDetail(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setIsLoading(false)
      }
    }
    loadDetail()
  }, [id])

  if (isLoading) {
    return (
      <div className="py-20 text-center text-gray-400 text-sm">加载中...</div>
    )
  }

  if (error || !detail) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>{error || '未找到该 CDK'}</p>
        <button
          onClick={() => navigate('/cdks')}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          返回列表
        </button>
      </div>
    )
  }

  const orders: Order[] = detail.orders ?? []

  const infoItems = [
    { label: 'CDK 码', value: <span className="font-mono text-gray-800">{detail.code}</span> },
    { label: '服务', value: detail.serviceName },
    { label: '总次数', value: detail.totalUses },
    { label: '剩余次数', value: detail.remainingUses },
    { label: '状态', value: <StatusBadge status={detail.status} /> },
    { label: '创建时间', value: detail.createdAt },
  ]

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/cdks')}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
        >
          ← 返回
        </button>
        <h2 className="text-xl font-semibold text-gray-900">CDK 详情</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">基本信息</h3>
        <div className="grid grid-cols-3 gap-y-4 gap-x-6">
          {infoItems.map(item => (
            <div key={item.label}>
              <p className="text-xs text-gray-400 mb-1">{item.label}</p>
              <div className="text-sm text-gray-800">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">使用记录</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-medium text-gray-600">兑换时间</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">号码</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">短信内容</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">验证码</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">结果</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">完成时间</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  暂无使用记录
                </td>
              </tr>
            ) : (
              orders.map((order: Order) => (
                <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{order.createdAt}</td>
                  <td className="px-5 py-3 text-gray-600 font-mono whitespace-nowrap">
                    {order.phoneNumber ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-600 max-w-xs">
                    {order.smsContent ? (
                      <span className="block truncate" title={order.smsContent}>
                        {order.smsContent}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-800">
                    {order.verificationCode ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <ResultBadge status={order.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                    {order.completedAt ?? <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
