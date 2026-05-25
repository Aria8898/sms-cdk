import { Outlet, NavLink, useNavigate } from 'react-router-dom'

const navItems = [
  { to: '/providers', label: 'Provider 管理' },
  { to: '/services', label: 'Service 管理' },
  { to: '/cdks', label: 'CDK 管理' },
]

export default function Layout() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('admin_authed')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <span className="text-base font-semibold text-gray-900">SMS CDK 管理</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            退出登录
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
