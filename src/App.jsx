import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import OrderListPage from './pages/OrderListPage'
import InvoiceTestPage from './pages/InvoiceTestPage'
import PublicInvoicePage from './pages/PublicInvoicePage'
import NotFoundPage from './pages/NotFoundPage'

// Guard: chỉ ACCOUNTANT / SUPERADMIN mới vào được
function Protected({ children }) {
  const { auth, isAccountant } = useAuth()
  const loc = useLocation()
  if (!auth) return <Navigate to="/login" state={{ from: loc }} replace />
  if (!isAccountant) return <NotFoundPage />
  return children
}

export default function App() {
  // /?orderCode=xxx → Public invoice form
  const params = new URLSearchParams(window.location.search)
  const orderCode = params.get('orderCode')
  if (window.location.pathname === '/' && orderCode) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PublicInvoicePage orderCode={orderCode} />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — ACCOUNTANT only */}
        <Route path="/orders" element={<Protected><OrderListPage /></Protected>} />
        <Route path="/invoice-test" element={<Protected><InvoiceTestPage /></Protected>} />

        {/* Catch-all → 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
