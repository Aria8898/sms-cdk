export default function Dashboard({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">{title}</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm text-gray-400">内容建设中...</p>
      </div>
    </div>
  )
}
