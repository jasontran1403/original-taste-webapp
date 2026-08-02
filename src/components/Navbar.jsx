import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const LINKS = [
  { to: '/accountant',        icon: '📊', label: 'Kế toán',   end: true },
  { to: '/accountant/orders', icon: '📋', label: 'Đơn hàng' },
  { to: '/accountant/sign',   icon: '✍️', label: 'Ký số' },
]

/**
 * Thanh điều hướng cho khu vực Kế toán.
 *
 * Full-width: dùng `w-full` + padding co giãn thay vì `max-w-screen-2xl mx-auto`,
 * nên trên màn hình rộng không còn hai dải trống hai bên.
 * Mobile: nav thu vào nút hamburger, mở ra thành danh sách dọc.
 */
export default function Navbar() {
  const { clearAuth, auth } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  const linkCls = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors
     ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`

  const logout = () => { clearAuth(); nav('/login') }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center h-14 gap-4 sm:gap-6">

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-base">🧾</div>
          <span className="font-bold text-gray-900 text-sm hidden sm:block">Original Taste</span>
        </div>

        {/* Nav — desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <span>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bên phải */}
        <div className="ml-auto flex items-center gap-2">
          {auth?.role && (
            <span className="hidden lg:inline-flex badge bg-gray-100 text-gray-500">{auth.role}</span>
          )}
          <button onClick={logout} className="btn-ghost text-gray-500 hover:text-red-600">
            <span>↩</span><span className="hidden sm:inline">Đăng xuất</span>
          </button>

          {/* Hamburger — mobile */}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Nav — mobile */}
      {open && (
        <nav className="md:hidden border-t border-gray-100 px-4 py-2 flex flex-col gap-1 bg-white">
          {LINKS.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls} onClick={() => setOpen(false)}>
              <span>{icon}</span><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}