import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { serviceCategoriesApi, cdksApi, type ServiceCategory, type Cdk } from '../lib/api'

export default function CdkGenerate() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(true)
  const [categoryId, setCategoryId] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [cdkType, setCdkType] = useState<'count' | 'timed'>('count')
  const [usesPerCdk, setUsesPerCdk] = useState(1)
  const [validityMinutes, setValidityMinutes] = useState(60)
  const [quantity, setQuantity] = useState(10)
  const [generated, setGenerated] = useState<Cdk[]>([])
  const [copied, setCopied] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    async function loadCategories() {
      setIsLoadingCategories(true)
      try {
        const cats = await serviceCategoriesApi.list()
        setCategories(cats)
        if (cats.length > 0) {
          setCategoryId(cats[0].id)
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : '加载服务分类失败')
      } finally {
        setIsLoadingCategories(false)
      }
    }
    loadCategories()
  }, [])

  const selectedCategory = categories.find(c => c.id === categoryId)
  const trimmedCountry = countryCode.trim().toUpperCase()
  const isCountryValid = !trimmedCountry || /^[A-Z]{2}$/.test(trimmedCountry)

  const preview = selectedCategory
    ? trimmedCountry && isCountryValid && trimmedCountry.length === 2
      ? `${selectedCategory.shortName}-${trimmedCountry}-XXXX-XXXX`
      : `${selectedCategory.shortName}-XXXX-XXXX-XXXX`
    : 'XXXX-XXXX-XXXX-XXXX'

  async function handleGenerate() {
    if (!categoryId) return
    if (!isCountryValid) return
    if (cdkType === 'timed' && (validityMinutes < 1 || validityMinutes > 10080)) return
    setIsGenerating(true)
    try {
      const result = await cdksApi.generate({
        categoryId,
        usesPerCdk: cdkType === 'timed' ? 1 : usesPerCdk,
        quantity,
        countryCode: trimmedCountry || undefined,
        cdkType,
        validityMinutes: cdkType === 'timed' ? validityMinutes : undefined,
      })
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
            <label className="block text-sm font-medium text-gray-700 mb-1">选择服务类型</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              disabled={isLoadingCategories}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoadingCategories ? (
                <option>加载中...</option>
              ) : (
                categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))
              )}
            </select>
          </div>

          {/* CDK 类型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">CDK 类型</label>
            <div className="grid grid-cols-2 gap-2">
              {(['count', 'timed'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCdkType(t)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                    cdkType === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t === 'count' ? '按次' : '时效'}
                  <p className="text-xs font-normal mt-0.5 text-current opacity-70">
                    {t === 'count' ? '每次收码扣 1 次' : '有效期内无限接码'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              指定国家
              <span className="ml-1 text-xs text-gray-400 font-normal">（可选，ISO 2 字母码如 US、GB、CN）</span>
            </label>
            <input
              type="text"
              value={countryCode}
              onChange={e => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="不填则为普通 CDK"
              maxLength={2}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !isCountryValid ? 'border-red-400 focus:ring-red-400' : 'border-gray-300'
              }`}
            />
            {!isCountryValid && (
              <p className="mt-1 text-xs text-red-500">请输入 2 位大写字母国家码（如 US）</p>
            )}
          </div>

          {cdkType === 'count' ? (
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
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                有效时长（分钟）
                <span className="ml-1 text-xs text-gray-400 font-normal">（1–10080，最长 7 天）</span>
              </label>
              <input
                type="number"
                value={validityMinutes}
                onChange={e => setValidityMinutes(Math.min(10080, Math.max(1, Number(e.target.value))))}
                min={1}
                max={10080}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                ≈ {(validityMinutes / 60).toFixed(1)} 小时
              </p>
            </div>
          )}

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
              {trimmedCountry && isCountryValid && trimmedCountry.length === 2
                ? `国家专属格式：{缩写}-{ISO}-XXXX-XXXX`
                : `普通格式：{缩写}-XXXX-XXXX-XXXX`}
            </p>
            <p className="text-xs text-gray-400">
              {cdkType === 'timed'
                ? `时效型：有效期 ${validityMinutes} 分钟，有效期内无限接码`
                : `按次型：每张 ${usesPerCdk} 次`}
            </p>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || isLoadingCategories || !categoryId || !isCountryValid}
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
