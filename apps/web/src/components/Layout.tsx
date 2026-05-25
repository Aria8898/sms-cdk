import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4">
          <h1 className="text-lg font-semibold text-gray-800">SMS 接码</h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
