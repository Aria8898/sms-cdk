import { useState } from 'react'

interface Service {
  id: string
  name: string
  shortName: string
  providerId: string
  providerName: string
  externalServiceId: string
  successRateThreshold: number
  maxPrice: number
  cdkCount: number
}

const mockProviders = [
  { id: '1', name: 'SMSPool' },
]

const initialServices: Service[] = [
  { id: '1', name: 'OpenAI',   shortName: 'OP', providerId: '1', providerName: 'SMSPool', externalServiceId: '395', successRateThreshold: 70, maxPrice: 0.5, cdkCount: 12 },
  { id: '2', name: 'Twitter',  shortName: 'TW', providerId: '1', providerName: 'SMSPool', externalServiceId: '56',  successRateThreshold: 65, maxPrice: 0.3, cdkCount: 8  },
  { id: '3', name: 'Telegram', shortName: 'TG', providerId: '1', providerName: 'SMSPool', externalServiceId: '1',   successRateThreshold: 80, maxPrice: 0.8, cdkCount: 5  },
]

function toPrefix(name: string) {
  return name.slice(0, 2).toUpperCase()
}

interface EditState {
  successRateThreshold: number
  maxPrice: number
}

export default function Services() {
  const [services, setServices] = useState<Service[]>(initialServices)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ successRateThreshold: 0, maxPrice: 0 })

  const [formName, setFormName] = useState('')
  const [formShortName, setFormShortName] = useState('')
  const [formProviderId, setFormProviderId] = useState(mockProviders[0]?.id ?? '')
  const [formExternalId, setFormExternalId] = useState('')
  const [formThreshold, setFormThreshold] = useState(70)
  const [formMaxPrice, setFormMaxPrice] = useState(0.5)

  function startEdit(svc: Service) {
    setEditingId(svc.id)
    setEditState({ successRateThreshold: svc.successRateThreshold, maxPrice: svc.maxPrice })
  }

  function saveEdit(id: string) {
    setServices(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, successRateThreshold: editState.successRateThreshold, maxPrice: editState.maxPrice }
          : s
      )
    )
    setEditingId(null)
  }

  function handleDelete(id: string) {
    if (window.confirm('确认删除该 Service？')) {
      setServices(prev => prev.filter(s => s.id !== id))
    }
  }

  function handleAdd() {
    if (!formName.trim()) return
    const provider = mockProviders.find(p => p.id === formProviderId)
    const newService: Service = {
      id: String(Date.now()),
      name: formName.trim(),
      shortName: formShortName || toPrefix(formName.trim()),
      providerId: formProviderId,
      providerName: provider?.name ?? '',
      externalServiceId: formExternalId.trim(),
      successRateThreshold: formThreshold,
      maxPrice: formMaxPrice,
      cdkCount: 0,
    }
    setServices(prev => [...prev, newService])
    setShowForm(false)
    setFormName('')
    setFormShortName('')
    setFormExternalId('')
    setFormThreshold(70)
    setFormMaxPrice(0.5)
  }

  function handleCancelForm() {
    setShowForm(false)
    setFormName('')
    setFormShortName('')
    setFormExternalId('')
    setFormThreshold(70)
    setFormMaxPrice(0.5)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Service 管理</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          添加 Service
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">新增 Service</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={formName}
                onChange={e => {
                  setFormName(e.target.value)
                  setFormShortName(toPrefix(e.target.value))
                }}
                placeholder="例如：OpenAI"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">前缀（自动生成）</label>
              <input
                type="text"
                value={formShortName}
                onChange={e => setFormShortName(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="例如：OP"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select
                value={formProviderId}
                onChange={e => setFormProviderId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {mockProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">外部 Service ID</label>
              <input
                type="text"
                value={formExternalId}
                onChange={e => setFormExternalId(e.target.value)}
                placeholder="例如：395"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">成功率阈值 (%)</label>
              <input
                type="number"
                value={formThreshold}
                onChange={e => setFormThreshold(Number(e.target.value))}
                min={0}
                max={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">最高单价 ($)</label>
              <input
                type="number"
                value={formMaxPrice}
                onChange={e => setFormMaxPrice(Number(e.target.value))}
                min={0}
                step={0.01}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              确认添加
            </button>
            <button
              onClick={handleCancelForm}
              className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-medium text-gray-600">名称</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">前缀</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Provider</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Service ID</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">成功率阈值</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">最高单价</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">CDK 数</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                  暂无 Service，点击右上角按钮添加
                </td>
              </tr>
            ) : (
              services.map(svc => {
                const isEditing = editingId === svc.id
                return (
                  <tr key={svc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{svc.name}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono">{svc.shortName}</td>
                    <td className="px-5 py-3 text-gray-600">{svc.providerName}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono">{svc.externalServiceId}</td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editState.successRateThreshold}
                          onChange={e => setEditState(s => ({ ...s, successRateThreshold: Number(e.target.value) }))}
                          min={0}
                          max={100}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-gray-600">{svc.successRateThreshold}%</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editState.maxPrice}
                          onChange={e => setEditState(s => ({ ...s, maxPrice: Number(e.target.value) }))}
                          min={0}
                          step={0.01}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-gray-600">${svc.maxPrice.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{svc.cdkCount}</td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(svc.id)}
                            className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm transition-colors"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-500 hover:bg-gray-100 px-2 py-1 rounded text-sm transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(svc)}
                            className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm transition-colors"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(svc.id)}
                            className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-sm transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
