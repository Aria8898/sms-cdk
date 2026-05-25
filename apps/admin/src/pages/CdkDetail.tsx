import { useNavigate, useParams } from 'react-router-dom'

interface Cdk {
  id: string
  code: string
  service: string
  totalUses: number
  remainingUses: number
  status: 'active' | 'exhausted'
  createdAt: string
}

interface Order {
  id: string
  createdAt: string
  phone: string
  sms: string
  code: string
  result: 'success' | 'timeout' | 'cancelled'
  completedAt: string
}

const mockCdks: Cdk[] = [
  { id: '1',  code: 'OP-A3KF-9ZMR-B72X', service: 'OpenAI',   totalUses: 5,  remainingUses: 3,  status: 'active',    createdAt: '2025-05-20' },
  { id: '2',  code: 'OP-M7NP-K2QR-X9WV', service: 'OpenAI',   totalUses: 5,  remainingUses: 0,  status: 'exhausted', createdAt: '2025-05-20' },
  { id: '3',  code: 'TW-B4HR-7ZKQ-P3MN', service: 'Twitter',  totalUses: 3,  remainingUses: 3,  status: 'active',    createdAt: '2025-05-21' },
  { id: '4',  code: 'TW-X9WV-2MKR-A5HQ', service: 'Twitter',  totalUses: 3,  remainingUses: 1,  status: 'active',    createdAt: '2025-05-21' },
  { id: '5',  code: 'TG-K7NR-4ZXP-W2MB', service: 'Telegram', totalUses: 1,  remainingUses: 1,  status: 'active',    createdAt: '2025-05-22' },
  { id: '6',  code: 'TG-P3HQ-8MNV-R6ZK', service: 'Telegram', totalUses: 1,  remainingUses: 0,  status: 'exhausted', createdAt: '2025-05-22' },
  { id: '7',  code: 'OP-W5KR-3NZX-M8HQ', service: 'OpenAI',   totalUses: 10, remainingUses: 7,  status: 'active',    createdAt: '2025-05-23' },
  { id: '8',  code: 'OP-Z2MN-6HKP-B4XR', service: 'OpenAI',   totalUses: 10, remainingUses: 10, status: 'active',    createdAt: '2025-05-23' },
  { id: '9',  code: 'TW-H8ZK-5XNR-Q7MP', service: 'Twitter',  totalUses: 5,  remainingUses: 2,  status: 'active',    createdAt: '2025-05-24' },
  { id: '10', code: 'TG-N4XP-9KZR-V3HM', service: 'Telegram', totalUses: 3,  remainingUses: 3,  status: 'active',    createdAt: '2025-05-24' },
]

const mockOrders: Order[] = [
  {
    id: '1',
    createdAt: '2025-05-20 14:23:11',
    phone: '+1 (415) 555-0192',
    sms: 'Your OpenAI code is 847291. Do not share.',
    code: '847291',
    result: 'success',
    completedAt: '2025-05-20 14:24:38',
  },
  {
    id: '2',
    createdAt: '2025-05-21 09:11:05',
    phone: '+44 7911 123456',
    sms: '',
    code: '',
    result: 'timeout',
    completedAt: '2025-05-21 09:31:05',
  },
]

function StatusBadge({ status }: { status: Cdk['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        可用
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      已用完
    </span>
  )
}

function ResultBadge({ result }: { result: Order['result'] }) {
  if (result === 'success') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        成功
      </span>
    )
  }
  if (result === 'timeout') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">
        超时
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

  const cdk = mockCdks.find(c => c.id === id)

  if (!cdk) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>未找到该 CDK</p>
        <button
          onClick={() => navigate('/cdks')}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          返回列表
        </button>
      </div>
    )
  }

  // Only show orders for CDK id=1; others show empty
  const orders = cdk.id === '1' ? mockOrders : []

  const infoItems = [
    { label: 'CDK 码', value: <span className="font-mono text-gray-800">{cdk.code}</span> },
    { label: '服务', value: cdk.service },
    { label: '总次数', value: cdk.totalUses },
    { label: '剩余次数', value: cdk.remainingUses },
    { label: '状态', value: <StatusBadge status={cdk.status} /> },
    { label: '创建时间', value: cdk.createdAt },
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
              orders.map(order => (
                <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{order.createdAt}</td>
                  <td className="px-5 py-3 text-gray-600 font-mono whitespace-nowrap">{order.phone}</td>
                  <td className="px-5 py-3 text-gray-600 max-w-xs">
                    {order.sms ? (
                      <span
                        className="block truncate"
                        title={order.sms}
                      >
                        {order.sms}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-800">
                    {order.code || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <ResultBadge result={order.result} />
                  </td>
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{order.completedAt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
