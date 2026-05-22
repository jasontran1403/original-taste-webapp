import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const links = [
  { to: '/orders',       icon: '📋', label: 'Danh sách đơn' },
  // { to: '/invoice-test', icon: '🔬', label: 'Test API'      },
]

export default function Navbar() {
  const { clearAuth } = useAuth()
  const nav = useNavigate()

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-screen-2xl mx-auto px-4 flex items-center h-14 gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-base">🧾</div>
          <span className="font-bold text-gray-900 text-sm hidden sm:block">Invoice Manager</span>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ to, icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                 ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
              }
            >
              <span>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Spacer + logout */}
        <div className="ml-auto">
          <button
            onClick={() => { clearAuth(); nav('/login') }}
            className="btn-ghost text-gray-500 hover:text-red-600"
          >
            <span>↩</span> Đăng xuất
          </button>
        </div>
      </div>
    </header>
  )
}
