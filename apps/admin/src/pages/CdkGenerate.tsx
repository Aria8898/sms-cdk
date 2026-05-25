import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { servicesApi, cdksApi, type Service, type Cdk } from '../lib/api'

export default function CdkGenerate() {
  const navigate = useNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState(true)
  const [serviceId, setServiceId] = useState('')
  const [usesPerCdk, setUsesPerCdk] = useState(1)
  const [quantity, setQuantity] = useState(10)
  const [generated, setGenerated] = useState<Cdk[]>([])
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    async function loadServices() {
      setIsLoadingServices(true)
      try {
        const data = await servicesApi.list()
        setServices(data)
        if (data.length > 0) {
          setServiceId(data[0].id)
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : '加载服务列表失败')
      } finally {
        setIsLoadingServices(false)
      }
    }
    loadServices()
  }, [])

  const selectedService = services.find(s => s.id === serviceId)
  const preview = selectedService ? `${selectedService.shortName}-XXXX-XXXX-XXXX` : 'XXXX-XXXX-XXXX-XXXX'

  async function handleGenerate() {
    if (!serviceId) return
    setIsGenerating(true)
    try {
      const result = await cdksApi.generate({ serviceId, usesPerCdk, quantity })
      setGenerated(result.cdks)
      setCopied(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleCopyAll() {
    const text = generated.map(c => c.code).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/cdks')}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
        >
          ← 返回
        </button>
        <h2 className="text-xl font-semibold text-gray-900">批量生成 CDK</h2>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">选择 Service</label>
            <select
              value={serviceId}
              onChange={e => setServiceId(e.target.value)}
              disabled={isLoadingServices}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoadingServices ? (
                <option>加载中...</option>
              ) : (
                services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">每张可用次数</label>
            <input
              type="number"
              value={usesPerCdk}
              onChange={e => setUsesPerCdk(Math.max(1, Number(e.target.value)))}
              min={1}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">生成数量（最多 100）</label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(Math.min(100, Math.max(1, Number(e.target.value))))}
              min={1}
              max={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">CDK 格式预览</p>
            <p className="font-mono text-base text-gray-800 tracking-widest">{preview}</p>
            <p className="text-xs text-gray-400 mt-2">
              字符集：A-Z 及 2-9（排除易混淆字符 0 O I L 1）
            </p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || isLoadingServices || !serviceId}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isGenerating ? '生成中...' : '生成'}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">
              生成结果 {generated.length > 0 && `（${generated.length} 条）`}
            </h3>
            {generated.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 text-xs font-medium rounded-lg transition-colors"
                >
                  重新生成
                </button>
                <button
                  onClick={handleCopyAll}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    copied
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {copied ? '已复制' : '复制全部'}
                </button>
              </div>
            )}
          </div>

          {generated.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              点击"生成"按钮后，结果将显示在这里
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 w-12">#</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">CDK 码</th>
                  </tr>
                </thead>
                <tbody>
                  {generated.map((cdk, idx) => (
                    <tr key={cdk.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-4 py-2 font-mono text-gray-800">{cdk.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
