import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import OrderListPage from './pages/OrderListPage'
import InvoiceTestPage from './pages/InvoiceTestPage'
import PublicInvoicePage from './pages/PublicInvoicePage'
import NotFoundPage from './pages/NotFoundPage'

function Protected({ children }) {
  const { auth, isAccountant } = useAuth()
  const loc = useLocation()
  if (!auth) return <Navigate to="/login" state={{ from: loc }} replace />
  if (!isAccountant) return <NotFoundPage />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*
          Public: form xuất hóa đơn — truy cập qua QR trên bill
          Route: /invoice/:token
          token = invoice_token (UUID ngẫu nhiên từ backend), VD:
            https://www.original-taste.vn/invoice/550e8400-e29b-41d4-a716-446655440000
        */}
        <Route path="/invoice/:token" element={<PublicInvoicePage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — ACCOUNTANT only */}
        <Route path="/orders"       element={<Protected><OrderListPage /></Protected>} />
        <Route path="/invoice-test" element={<Protected><InvoiceTestPage /></Protected>} />

        {/* Root → 404 (không còn dùng ?orderCode= nữa) */}
        <Route path="/"  element={<NotFoundPage />} />
        <Route path="*"  element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}