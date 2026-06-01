/**
 * Bound Orders 管理页面
 * 列出所有号码绑定型 CDK 的订单，支持筛选、手动绑定、换号操作。
 */

import { useState, useEffect, useCallback } from 'react'
import { cdksApi, type Cdk, type Order } from '../lib/api'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoundOrderRow extends Order {
  cdkCode: string
  lastSmsAt: string | null
  expiresAt: string | null
  orderedAt: string | null
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function statusLabel(status: string): { text: string; cls: string } {
  if (status === 'active') return { text: '生效中', cls: 'bg-green-100 text-green-700' }
  if (status === 'expired') return { text: '已过期', cls: 'bg-gray-100 text-gray-500' }
  return { text: status, cls: 'bg-gray-100 text-gray-500' }
}

// ─── 手动绑定弹窗 ─────────────────────────────────────────────────────────────

function ManualBindModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ cdkCode: '', phoneNumber: '', orderNo: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.cdkCode || !form.phoneNumber || !form.orderNo) {
      setError('请填写所有字段')
      return
    }
    setLoading(true)
    try {
      await cdksApi.manualBind({
        cdkCode: form.cdkCode.trim().toUpperCase(),
        phoneNumber: form.phoneNumber.trim(),
        orderNo: form.orderNo.trim(),
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-4">手动绑定号码</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CDK 代码</label>
            <input
              type="text"
              value={form.cdkCode}
              onChange={e => setForm(f => ({ ...f, cdkCode: e.target.value.toUpperCase() }))}
              placeholder="CDK-XXXX-XXXX-XXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">手机号码</label>
            <input
              type="text"
              value={form.phoneNumber}
              onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
              placeholder="+86 138xxxx8888"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order No
              <span className="ml-1 text-xs font-normal text-gray-400">（从 yamasakisms 取号后获得）</span>
            </label>
            <input
              type="text"
              value={form.orderNo}
              onChange={e => setForm(f => ({ ...f, orderNo: e.target.value }))}
              placeholder="389684649653202944"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? '提交中...' : '确认绑定'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── 换号弹窗 ─────────────────────────────────────────────────────────────────

function RebindModal({
  order,
  onClose,
  onSuccess,
}: {
  order: BoundOrderRow
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({ newPhoneNumber: '', newOrderNo: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.newPhoneNumber || !form.newOrderNo) {
      setError('请填写所有字段')
      return
    }
    setLoading(true)
    try {
      await cdksApi.rebind(order.id, {
        newPhoneNumber: form.newPhoneNumber.trim(),
        newOrderNo: form.newOrderNo.trim(),
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-1">换号</h3>
        <p className="text-sm text-gray-500 mb-4">
          当前手机号：<span className="font-medium text-gray-700">{order.phoneNumber ?? '—'}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新手机号</label>
            <input
              type="text"
              value={form.newPhoneNumber}
              onChange={e => setForm(f => ({ ...f, newPhoneNumber: e.target.value }))}
              placeholder="+86 138xxxx2222"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              新 Order No
              <span className="ml-1 text-xs font-normal text-gray-400">（管理员已在 yamasakisms 取好新号）</span>
            </label>
            <input
              type="text"
              value={form.newOrderNo}
              onChange={e => setForm(f => ({ ...f, newOrderNo: e.target.value }))}
              placeholder="389684649653209999"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? '提交中...' : '确认换号'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function BoundOrders() {
  const [rows, setRows] = useState<BoundOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all')
  const [showManualBind, setShowManualBind] = useState(false)
  const [rebindTarget, setRebindTarget] = useState<BoundOrderRow | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const selfBase = import.meta.env.VITE_SELF_BASE_URL ?? 'https://sms.985008.xyz'

  const token = localStorage.getItem('admin_token')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      // 从 admin CDK 列表中筛选 bound 类型 CDK，再获取其订单
      const res = await fetch(`${BASE}/api/cdks?pageSize=200`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as { data: Cdk[] }
      const boundCdks = (data.data ?? []).filter((c: Cdk) => c.cdkType === 'bound')

      // 并发获取每个 bound CDK 的订单详情
      const allRows: BoundOrderRow[] = []
      await Promise.all(
        boundCdks.map(async (cdk) => {
          const detailRes = await fetch(`${BASE}/api/cdks/${cdk.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!detailRes.ok) return
          const detail = await detailRes.json() as { orders: Array<Order & { smsList?: Array<{ receivedAt: string }> }> }
          const boundOrders = (detail.orders ?? []).filter(o => o.status === 'active' || o.status === 'expired')
          for (const o of boundOrders) {
            const lastSmsAt = o.smsList && o.smsList.length > 0
              ? o.smsList[o.smsList.length - 1].receivedAt
              : null
            allRows.push({
              ...o,
              cdkCode: cdk.code,
              lastSmsAt,
              expiresAt: (o as unknown as { expiresAt?: string }).expiresAt ?? null,
              orderedAt: (o as unknown as { orderedAt?: string }).orderedAt ?? null,
            })
          }
        }),
      )

      // 按创建时间降序
      allRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setRows(allRows)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const filtered = rows.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter,
  )

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Bound 订单管理</h2>
        <button
          onClick={() => setShowManualBind(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + 手动绑定
        </button>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'expired'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'all' ? '全部' : s === 'active' ? '生效中' : '已过期'}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400 self-center">共 {filtered.length} 条</span>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">暂无数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">CDK</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">手机号</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">取号时间</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">过期时间</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">最后接码</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const { text, cls } = statusLabel(row.status)
                const codeApiUrl = `${selfBase}/api/${row.cdkCode}`
                return (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.cdkCode}</td>
                    <td className="px-4 py-3 text-gray-700">{row.phoneNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{text}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(row.orderedAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(row.expiresAt)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(row.lastSmsAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(codeApiUrl, row.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                            copiedId === row.id
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {copiedId === row.id ? '已复制' : '复制链接'}
                        </button>
                        {row.status === 'active' && (
                          <button
                            onClick={() => setRebindTarget(row)}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                          >
                            换号
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showManualBind && (
        <ManualBindModal
          onClose={() => setShowManualBind(false)}
          onSuccess={() => { setShowManualBind(false); loadOrders() }}
        />
      )}

      {rebindTarget && (
        <RebindModal
          order={rebindTarget}
          onClose={() => setRebindTarget(null)}
          onSuccess={() => { setRebindTarget(null); loadOrders() }}
        />
      )}
    </div>
  )
}
