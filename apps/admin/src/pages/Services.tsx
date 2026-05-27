import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import {
  servicesApi, serviceCategoriesApi, providersApi,
  type ServiceCategory, type Service, type Provider,
} from '../lib/api'

function toShortName(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function TagInput({
  tags, onChange, placeholder = '输入国家代码按 Enter 添加',
}: {
  tags: string[]; onChange: (tags: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addTag(value: string) {
    const trimmed = value.trim().toUpperCase()
    if (!trimmed || tags.includes(trimmed)) { setInput(''); return }
    onChange([...tags, trimmed])
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input) }
    else if (e.key === 'Backspace' && input === '' && tags.length > 0) onChange(tags.slice(0, -1))
  }

  return (
    <div
      className="flex flex-wrap gap-1 items-center min-h-[38px] px-2 py-1.5 border border-gray-300 rounded-lg bg-white cursor-text focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-mono font-medium">
          {tag}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)) }} className="text-orange-500 hover:text-orange-800 leading-none">×</button>
        </span>
      ))}
      <input
        ref={inputRef} value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] outline-none text-sm bg-transparent"
      />
    </div>
  )
}

interface ServiceFormState {
  categoryId: string
  providerId: string
  externalServiceId: string
  isDefault: boolean
  successRateThreshold: number
  maxPrice: number
  blockedCountries: string[]
}

interface EditServiceState {
  externalServiceId: string
  successRateThreshold: number
  maxPrice: number
  blockedCountries: string[]
  isDefault: boolean
}

export default function Services() {
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 新增 category 表单
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [catFormName, setCatFormName] = useState('')
  const [catFormShortName, setCatFormShortName] = useState('')

  // 编辑 category
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatShortName, setEditCatShortName] = useState('')

  // 新增 service 表单（按 category）
  const [showServiceFormForCat, setShowServiceFormForCat] = useState<string | null>(null)
  const [svcForm, setSvcForm] = useState<ServiceFormState>({
    categoryId: '', providerId: '', externalServiceId: '',
    isDefault: false, successRateThreshold: 70, maxPrice: 0.5, blockedCountries: [],
  })

  // 编辑 service
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [editSvcState, setEditSvcState] = useState<EditServiceState>({
    successRateThreshold: 70, maxPrice: 0.5, blockedCountries: [], isDefault: false,
  })

  async function loadData() {
    setIsLoading(true); setError('')
    try {
      const [cats, provs] = await Promise.all([servicesApi.list(), providersApi.list()])
      setCategories(cats)
      setProviders(provs)
      // 默认展开所有 category
      setExpandedIds(new Set(cats.map(c => c.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ---- Category 操作 ----
  async function handleRunMigrate() {
    if (!window.confirm('将为所有未分类的 Service 自动创建服务类型并回填，继续？')) return
    try {
      const res = await serviceCategoriesApi.migrate()
      alert(res.message)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '迁移失败')
    }
  }

  async function handleAddCategory() {
    if (!catFormName.trim()) return
    try {
      await serviceCategoriesApi.create({
        name: catFormName.trim(),
        shortName: catFormShortName || toShortName(catFormName.trim()),
      })
      setShowCategoryForm(false); setCatFormName(''); setCatFormShortName('')
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  function startEditCategory(cat: ServiceCategory) {
    setEditingCatId(cat.id); setEditCatName(cat.name); setEditCatShortName(cat.shortName)
  }

  async function saveEditCategory(id: string) {
    try {
      await serviceCategoriesApi.update(id, { name: editCatName.trim(), shortName: editCatShortName.trim() })
      setEditingCatId(null)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!window.confirm('确认删除该服务类型？（须先删除其下所有运营商实现）')) return
    try {
      await serviceCategoriesApi.delete(id)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  // ---- Service 操作 ----
  function openAddService(catId: string) {
    setShowServiceFormForCat(catId)
    setSvcForm({
      categoryId: catId,
      providerId: providers[0]?.id ?? '',
      externalServiceId: '',
      isDefault: false,
      successRateThreshold: 70,
      maxPrice: 0.5,
      blockedCountries: [],
    })
  }

  async function handleAddService() {
    if (!svcForm.externalServiceId.trim()) { alert('外部 Service ID 为必填项'); return }
    try {
      await servicesApi.create(svcForm)
      setShowServiceFormForCat(null)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  function startEditService(svc: Service) {
    setEditingServiceId(svc.id)
    setEditSvcState({
      externalServiceId: svc.externalServiceId,
      successRateThreshold: svc.successRateThreshold,
      maxPrice: svc.maxPrice,
      blockedCountries: svc.blockedCountries ?? [],
      isDefault: svc.isDefault,
    })
  }

  async function saveEditService(id: string) {
    try {
      await servicesApi.update(id, editSvcState)
      setEditingServiceId(null)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleSetDefault(svc: Service) {
    try {
      await servicesApi.update(svc.id, { isDefault: true })
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  async function handleDeleteService(id: string) {
    if (!window.confirm('确认删除该运营商实现？')) return
    try {
      await servicesApi.delete(id)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败')
    }
  }

  // 统计所有未分类的 services（需要迁移）
  const hasUncategorized = categories.length === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Service 管理</h2>
        <div className="flex gap-2">
          {hasUncategorized && !isLoading && (
            <button
              onClick={handleRunMigrate}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              一键迁移旧数据
            </button>
          )}
          <button
            onClick={() => setShowCategoryForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            添加服务类型
          </button>
        </div>
      </div>

      {/* 新增 category 表单 */}
      {showCategoryForm && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">新增服务类型</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">服务名称</label>
              <input
                type="text" value={catFormName}
                onChange={e => { setCatFormName(e.target.value); setCatFormShortName(toShortName(e.target.value)) }}
                placeholder="例如：OpenAI 验证码"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">前缀（CDK 格式）</label>
              <input
                type="text" value={catFormShortName}
                onChange={e => setCatFormShortName(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="例如：OP"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddCategory} disabled={!catFormName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
              确认添加
            </button>
            <button onClick={() => { setShowCategoryForm(false); setCatFormName(''); setCatFormShortName('') }}
              className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors">
              取消
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">加载中...</div>
      ) : error ? (
        <div className="py-12 text-center text-red-500 text-sm">{error}</div>
      ) : categories.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">
          暂无服务类型。
          {' '}
          <button onClick={handleRunMigrate} className="text-orange-500 hover:underline">点击迁移旧数据</button>
          {' '}或点击右上角「添加服务类型」。
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => {
            const isExpanded = expandedIds.has(cat.id)
            const isEditingCat = editingCatId === cat.id
            return (
              <div key={cat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Category 标题行 */}
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <button onClick={() => toggleExpand(cat.id)} className="text-gray-400 hover:text-gray-700 text-sm transition-colors w-5 text-center">
                    {isExpanded ? '▾' : '▸'}
                  </button>

                  {isEditingCat ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text" value={editCatName} onChange={e => setEditCatName(e.target.value)}
                        className="px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                      />
                      <input
                        type="text" value={editCatShortName} onChange={e => setEditCatShortName(e.target.value.toUpperCase().slice(0, 4))}
                        className="px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20 font-mono"
                      />
                      <button onClick={() => saveEditCategory(cat.id)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm transition-colors">保存</button>
                      <button onClick={() => setEditingCatId(null)} className="text-gray-500 hover:bg-gray-100 px-2 py-1 rounded text-sm transition-colors">取消</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-semibold text-gray-900">{cat.name}</span>
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono font-medium">{cat.shortName}</span>
                      <span className="text-xs text-gray-400">{cat.services.length} 个运营商</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => openAddService(cat.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      + 添加运营商
                    </button>
                    {!isEditingCat && (
                      <>
                        <button onClick={() => startEditCategory(cat)} className="text-gray-400 hover:text-blue-600 text-xs px-2 py-1 rounded transition-colors">编辑</button>
                        <button onClick={() => handleDeleteCategory(cat.id)} className="text-gray-400 hover:text-red-600 text-xs px-2 py-1 rounded transition-colors">删除</button>
                      </>
                    )}
                  </div>
                </div>

                {/* 新增 service 表单 */}
                {showServiceFormForCat === cat.id && (
                  <div className="px-5 py-4 bg-blue-50 border-b border-blue-200">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">添加运营商实现 · {cat.name}</h4>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">运营商 (Provider)</label>
                        <select value={svcForm.providerId} onChange={e => setSvcForm(s => ({ ...s, providerId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          {providers.map(p => <option key={p.id} value={p.id}>{p.alias ? `${p.alias} (${p.name})` : p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">外部 Service ID <span className="text-red-500">*</span></label>
                        <input type="text" value={svcForm.externalServiceId}
                          onChange={e => setSvcForm(s => ({ ...s, externalServiceId: e.target.value }))}
                          placeholder="例如：395"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">成功率阈值 (%)</label>
                        <input type="number" value={svcForm.successRateThreshold} min={0} max={100}
                          onChange={e => setSvcForm(s => ({ ...s, successRateThreshold: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">最高单价 ($)</label>
                        <input type="number" value={svcForm.maxPrice} min={0} step={0.01}
                          onChange={e => setSvcForm(s => ({ ...s, maxPrice: Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div className="flex items-end gap-2 pb-0.5">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                          <input type="checkbox" checked={svcForm.isDefault}
                            onChange={e => setSvcForm(s => ({ ...s, isDefault: e.target.checked }))}
                            className="w-4 h-4"
                          />
                          设为推荐运营商 ⭐
                        </label>
                      </div>
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">屏蔽国家</label>
                        <TagInput tags={svcForm.blockedCountries} onChange={v => setSvcForm(s => ({ ...s, blockedCountries: v }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAddService} disabled={!svcForm.externalServiceId.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
                        确认添加
                      </button>
                      <button onClick={() => setShowServiceFormForCat(null)}
                        className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors">
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* Service 列表 */}
                {isExpanded && (
                  cat.services.length === 0 ? (
                    <div className="px-5 py-6 text-center text-gray-400 text-sm">
                      暂无运营商实现，点击「+ 添加运营商」
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-5 py-2.5 font-medium text-gray-500 text-xs">运营商</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Service ID</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">成功率阈值</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">最高单价</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">屏蔽国家</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">CDK 数</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cat.services.slice().sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map(svc => {
                          const isEditing = editingServiceId === svc.id
                          const blocked = svc.blockedCountries ?? []
                          return (
                            <>
                              <tr key={svc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{svc.providerAlias ? `${svc.providerAlias} (${svc.providerName})` : svc.providerName}</span>
                                    {svc.isDefault && (
                                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">推荐</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-gray-600 text-xs">{svc.externalServiceId}</td>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <input type="number" value={editSvcState.successRateThreshold} min={0} max={100}
                                      onChange={e => setEditSvcState(s => ({ ...s, successRateThreshold: Number(e.target.value) }))}
                                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="text-gray-600">{svc.successRateThreshold}%</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <input type="number" value={editSvcState.maxPrice} min={0} step={0.01}
                                      onChange={e => setEditSvcState(s => ({ ...s, maxPrice: Number(e.target.value) }))}
                                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  ) : (
                                    <span className="text-gray-600">${svc.maxPrice.toFixed(2)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {blocked.length === 0 ? (
                                    <span className="text-gray-400 text-xs">无</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {blocked.slice(0, 3).map(c => (
                                        <span key={c} className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-mono">{c}</span>
                                      ))}
                                      {blocked.length > 3 && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">+{blocked.length - 3}</span>}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-600">{svc.cdkCount ?? 0}</td>
                                <td className="px-4 py-3">
                                  {isEditing ? (
                                    <div className="flex gap-1">
                                      <button onClick={() => saveEditService(svc.id)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs transition-colors">保存</button>
                                      <button onClick={() => setEditingServiceId(null)} className="text-gray-500 hover:bg-gray-100 px-2 py-1 rounded text-xs transition-colors">取消</button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-1">
                                      {!svc.isDefault && (
                                        <button onClick={() => handleSetDefault(svc)} className="text-yellow-600 hover:bg-yellow-50 px-2 py-1 rounded text-xs transition-colors" title="设为推荐">⭐</button>
                                      )}
                                      <button onClick={() => startEditService(svc)} className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs transition-colors">编辑</button>
                                      <button onClick={() => handleDeleteService(svc.id)} className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-xs transition-colors">删除</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {/* 编辑时展开：External Service ID / 屏蔽国家 / isDefault */}
                              {isEditing && (
                                <tr key={`${svc.id}-edit`} className="border-b border-blue-100 bg-blue-50">
                                  <td colSpan={7} className="px-5 py-3">
                                    <div className="space-y-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                          外部 Service ID
                                        </label>
                                        <input
                                          type="text"
                                          value={editSvcState.externalServiceId}
                                          onChange={e => setEditSvcState(s => ({ ...s, externalServiceId: e.target.value }))}
                                          className="w-48 px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                      </div>
                                      <div className="flex items-start gap-6">
                                        <div className="flex-1">
                                          <label className="block text-xs font-medium text-gray-600 mb-1">屏蔽国家</label>
                                          <TagInput
                                            tags={editSvcState.blockedCountries}
                                            onChange={v => setEditSvcState(s => ({ ...s, blockedCountries: v }))}
                                          />
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mt-5">
                                          <input type="checkbox" checked={editSvcState.isDefault}
                                            onChange={e => setEditSvcState(s => ({ ...s, isDefault: e.target.checked }))}
                                            className="w-4 h-4"
                                          />
                                          推荐运营商 ⭐
                                        </label>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
