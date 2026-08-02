import { useState } from 'react'
import ToolShell from '../../components/ToolShell'
import MediaGallery from '../../components/media/MediaGallery'
import WatermarkEditor from '../../components/media/WatermarkEditor'

const TABS = [
  { key: 'library',   icon: '🖼️', label: 'Tài nguyên' },
  { key: 'watermark', icon: '💧', label: 'Watermark' },
]

/**
 * Trang tài nguyên + watermark, thiết kế ưu tiên điện thoại.
 *
 * Tab "Tài nguyên": gallery ảnh/video dùng chung, xem toàn màn hình, tải về.
 * Tab "Watermark" : gắn watermark rồi lưu ngược lại thư viện.
 *
 * Xử lý xong ở tab Watermark thì tự nhảy về Tài nguyên và làm mới danh sách —
 * người dùng thấy ngay kết quả thay vì phải tự bấm qua lại.
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
    <ToolShell icon="🖼️" title="Tài nguyên" subtitle="Ảnh, video và gắn watermark">
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[110] px-5 py-3 rounded-xl shadow-xl
          text-sm font-medium text-white max-w-[92vw] text-center
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Sub nav */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {TABS.map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors
              ${tab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'}`}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      {tab === 'library'
        ? <MediaGallery refreshKey={refreshKey} onNotify={notify} />
        : <WatermarkEditor onSaved={handleSaved} onNotify={notify} />}
    </ToolShell>
  )
}
