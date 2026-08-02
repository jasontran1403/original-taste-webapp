import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

/**
 * Khung chung cho khu vực Kế toán (/accountant/*).
 *
 * Nội dung full-width: chỉ chừa padding co giãn theo breakpoint thay vì
 * giới hạn max-width, để bảng đơn hàng dùng hết chiều ngang màn hình lớn.
 */
export default function AccountantLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
