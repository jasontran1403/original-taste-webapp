import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'

import AccountantLayout from './layouts/AccountantLayout'
import LoginPage from './pages/LoginPage'
import OrderListPage from './pages/OrderListPage'
import DashboardPage from './pages/accountant/DashboardPage'
import InvoiceTestPage from './pages/InvoiceTestPage'
import PublicInvoicePage from './pages/PublicInvoicePage'
import PublicSaleInvoicePage from './pages/PublicSaleInvoicePage'
import NotFoundPage from './pages/NotFoundPage'
import OrderNotFound from './components/OrderNotFound'

import QrPage from './pages/tools/QrPage'
import ESignPage from './pages/accountant/ESignPage'
import MediaPage from './pages/tools/MediaPage'

/** Chỉ ACCOUNTANT / SUPERADMIN — khu vực kế toán */
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
        {/* ── Public: form xuất hóa đơn, truy cập qua QR trên bill ── */}
        {/* /invoice/sale/:token phải khai TRƯỚC /invoice/:token */}
        <Route path="/invoice/sale/:token" element={<PublicSaleInvoicePage />} />
        <Route path="/invoice/:token"      element={<PublicInvoicePage />} />

        {/* ── Auth ── */}
        <Route path="/login" element={<LoginPage />} />

        {/* ── Khu vực Kế toán ── */}
        <Route path="/accountant" element={<Protected><AccountantLayout /></Protected>}>
          <Route index               element={<DashboardPage />} />
          <Route path="orders"       element={<OrderListPage />} />
          <Route path="sign"         element={<ESignPage />} />
          <Route path="invoice-test" element={<InvoiceTestPage />} />
        </Route>

        {/* Đường dẫn cũ — giữ lại để link/bookmark cũ không chết */}
        <Route path="/orders"       element={<Navigate to="/accountant/orders" replace />} />
        <Route path="/invoice-test" element={<Navigate to="/accountant/invoice-test" replace />} />

        {/*
          ── Tiện ích nội bộ ──
          KHÔNG yêu cầu đăng nhập, cũng không xuất hiện ở menu nào:
          ai biết đường dẫn thì vào. Backend /api/tools/** cũng đã được
          whitelist tương ứng trong SecurityConfiguration.
          /tools/qr        — tạo mã QR
          /tools/media     — thư viện tài nguyên + gắn watermark
                             (/tools/watermark giữ lại cho link cũ)

          Ký số PDF đã chuyển hẳn vào khu vực Kế toán (/accountant/sign),
          không còn đường dẫn công khai /tools/sign nữa.
        */}
        <Route path="/tools/qr"        element={<QrPage />} />
        <Route path="/tools/media"     element={<MediaPage />} />
        <Route path="/tools/watermark" element={<MediaPage />} />

        {/*
          Route gốc và mọi route lạ → màn hình "không tìm thấy đơn hàng".
          Người vào đây phần lớn là khách quét QR bị thiếu/sai mã, nên KHÔNG
          đá sang trang đăng nhập. Nhân viên kế toán vào thẳng /accountant.
        */}
        <Route path="/" element={
          <OrderNotFound message="Đường dẫn không kèm mã đơn hàng." />
        } />
        <Route path="*" element={
          <OrderNotFound message="Đường dẫn không hợp lệ hoặc mã đơn hàng không tồn tại." />
        } />
      </Routes>
    </BrowserRouter>
  )
}
