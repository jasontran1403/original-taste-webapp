import { useState } from 'react'
import MediaGallery, { TAB_BAR_HEIGHT } from '../../components/media/MediaGallery'
import WatermarkEditor from '../../components/media/WatermarkEditor'

const TABS = [
  { key: 'library',   icon: '🖼️', label: 'Tài nguyên' },
  { key: 'watermark', icon: '💧', label: 'Watermark' },
]

/**
 * Trang tài nguyên + watermark, ưu tiên điện thoại.
 *
 * Cố ý KHÔNG dùng ToolShell: trang này gần như toàn màn hình lưới ảnh, thêm
 * một thanh tiêu đề nữa chỉ ăn mất chiều cao vốn đã hẹp trên điện thoại.
 * Thanh tab được ghim ở đỉnh để chuyển qua lại lúc nào cũng được.
 *
 * Xử lý xong ở tab Watermark thì tự nhảy về Tài nguyên và làm mới danh sách.
 */
export default function MediaPage() {
  const [tab, setTab] = useState('library')
  const [refreshKey, setRefresh] = useState(0)
  const [toast, setToast] = useState(null)

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSaved = () => {
    setRefresh(k => k + 1)
    setTab('library')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[110] px-5 py-3 rounded-xl shadow-xl
          text-sm font-medium text-white max-w-[92vw] text-center
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Thanh tab ghim đỉnh */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center gap-1"
          style={{ height: TAB_BAR_HEIGHT }}>
          {TABS.map(({ key, icon, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-3 sm:px-4 h-full text-sm font-semibold
                border-b-2 -mb-px whitespace-nowrap transition-colors
                ${tab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 pb-8">
        {tab === 'library'
          ? <MediaGallery refreshKey={refreshKey} onNotify={notify} />
          : <div className="pt-4"><WatermarkEditor onSaved={handleSaved} onNotify={notify} /></div>}
      </div>
    </div>
  )
}