export default function Home() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">兑换号码</h2>
      <p className="text-sm text-gray-500 mb-6">输入 CDK 兑换码，获取一次性接码号码</p>
      <div className="space-y-4">
        <input
          type="text"
          placeholder="请输入 CDK 兑换码，如 OP-XXXX-XXXX-XXXX"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg text-sm transition-colors">
          立即兑换
        </button>
      </div>
    </div>
  )
}
