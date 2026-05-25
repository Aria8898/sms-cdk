import { useState, useEffect } from 'react'
import { providersApi, type Provider } from '../lib/api'

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
}

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')

  async function loadProviders() {
    setIsLoading(true)
    setError('')
    try {
      const data = await providersApi.list()
      setProviders(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])

  function handleNameChange(val: string) {
    setFormName(val)
    setFormSlug(toSlug(val))
  }

  async function handleAdd() {
    if (!formName.trim()) return
    try {
      await providersApi.create({ name: formName.trim(), slug: formSlug || toSlug(formName.trim()) })
      setShowForm(false)
      setFormName('')
      setFormSlug('')
      await loadProviders()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  function handleCancel() {
    setShowForm(false)
    setFormName('')
    setFormSlug('')
  }

  async function handleDelete(id: string) {
    if (!window.confirm('确认删除该 Provider？')) return
    try {
      await providersApi.delete(id)
      await loadProviders()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Provider 管理</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          添加 Provider
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">新增 Provider</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={formName}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="例如：SMSPool"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug（自动生成）</label>
              <input
                type="text"
                value={formSlug}
                onChange={e => setFormSlug(e.target.value)}
                placeholder="例如：smspool"
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
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">加载中...</div>
      ) : error ? (
        <div className="py-12 text-center text-red-500 text-sm">{error}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-medium text-gray-600">名称</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Slug</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">关联 Service 数</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">创建时间</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    暂无 Provider，点击右上角按钮添加
                  </td>
                </tr>
              ) : (
                providers.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono">{p.slug}</td>
                    <td className="px-5 py-3 text-gray-600">{p.serviceCount ?? 0}</td>
                    <td className="px-5 py-3 text-gray-600">{p.createdAt}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-sm transition-colors"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
