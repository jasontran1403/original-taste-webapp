import { useState } from 'react'
import PosOrdersTab from './tabs/PosOrdersTab'
import SaleOrdersTab from './tabs/SaleOrdersTab'
import { usePageState } from '../hooks/usePageState'

const TABS = [
  { key: 'sale', icon: '📦', label: 'Bán sỉ/lẻ' },
  { key: 'pos',  icon: '🏪', label: 'POS' },
]

/**
 * Màn hình tạo hóa đơn — 2 tab: Bán sỉ/lẻ và POS.
 * Route: /accountant/orders (render bên trong AccountantLayout nên không tự
 * dựng Navbar và không giới hạn max-width nữa).
 *
 * Mọi state (tab đang mở, trang, cửa hàng, khoảng ngày, từ khóa) được đẩy
 * lên URL qua usePageState nên F5 là khôi phục nguyên trạng, ví dụ:
 *   /accountant/orders?tab=sale&salePage=7
 *   /accountant/orders?tab=pos&posStore=2&posPage=3
 * Mỗi tab dùng bộ param riêng (tiền tố "pos" và "sale") nên chuyển qua lại
 * giữa 2 tab vẫn giữ đúng trang của từng bên.
 */
export default function OrderListPage() {
  const pageState = usePageState()
  const [toast, setToast] = useState(null)

  const tab = pageState.get('tab', 'sale')
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'sale'

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <>
      {toast && (
        <div className={`fixed top-16 right-4 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white max-w-[90vw]
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <h1 className="text-xl font-bold text-gray-900 mb-4">Tạo hóa đơn</h1>

      {/* Tab panel — cuộn ngang được trên màn hình hẹp */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => pageState.patch({ tab: key })}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors
              ${activeTab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'}`}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* Không dùng display:none — unmount hẳn tab kia để tránh gọi API thừa */}
      {activeTab === 'pos'
        ? <PosOrdersTab  pageState={pageState} showToast={showToast} />
        : <SaleOrdersTab pageState={pageState} showToast={showToast} />}
    </>
  )
}
