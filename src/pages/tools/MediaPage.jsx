import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolsAuth } from '../../hooks/useToolsAuth'
import MediaGallery, { TAB_BAR_HEIGHT } from '../../components/media/MediaGallery'
import WatermarkEditor from '../../components/media/WatermarkEditor'
import FilesBrowser from '../../components/files/FilesBrowser'
import OfficeWorkspace from '../../components/office/OfficeWorkspace'
import { SkeletonStyles } from '../../components/common/Skeleton'

/**
 * Bộ tiện ích: Hình ảnh · Tệp · Office · Watermark.
 *
 * Cố ý KHÔNG dùng ToolShell: mấy trang này gần như chiếm trọn màn hình, thêm
 * một thanh tiêu đề nữa chỉ ăn mất chiều cao vốn đã hẹp trên điện thoại.
 * Thanh tab ghim ở đỉnh để chuyển qua lại lúc nào cũng được.
 *
 * BỐ CỤC — hai chế độ khác nhau:
 *   • Hình ảnh / Tệp  → có lề hai bên, đọc danh sách dễ hơn khi dòng không quá dài.
 *   • Office / Watermark → FULL WIDTH, không lề. Đây là công cụ làm việc trực
 *     tiếp trên nội dung: bảng tính cần mọi pixel bề ngang, còn khung xem
 *     watermark càng lớn thì căn vị trí càng chính xác.
 */

const TABS = [
  { key: 'library',   icon: '🖼️', label: 'Hình ảnh' },
  { key: 'files',     icon: '📁', label: 'Tệp' },
  { key: 'office',    icon: '📊', label: 'Office' },
  { key: 'watermark', icon: '💧', label: 'Watermark' },
]

/** Tab nào chạy hết bề ngang màn hình */
const FULL_BLEED = new Set(['office', 'watermark'])

export default function MediaPage() {
  const [tab, setTab] = useState('library')
  const [refreshKey, setRefresh] = useState(0)
  const [toast, setToast] = useState(null)

  const { auth, logout } = useToolsAuth()
  const navigate = useNavigate()

  /**
   * Thanh tab tự ẩn khi đang cuộn, hiện lại khi ngừng — giống thanh công cụ trên
   * app ảnh điện thoại. Gần đỉnh trang thì luôn hiện.
   */
  const [navHidden, setNavHidden] = useState(false)
  const idleTimer = useRef(null)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0
      clearTimeout(idleTimer.current)
      if (y < 8) { setNavHidden(false); return }   // sát đỉnh → luôn hiện
      setNavHidden(true)
      idleTimer.current = setTimeout(() => setNavHidden(false), 220)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(idleTimer.current) }
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/tools/login', { replace: true })
  }

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  /** Gắn watermark xong thì nhảy về thư viện và làm mới danh sách */
  const handleSaved = () => {
    setRefresh(k => k + 1)
    setTab('library')
  }

  const fullBleed = FULL_BLEED.has(tab)

  // Đổi tab thì luôn cho thanh tab hiện lại
  useEffect(() => { setNavHidden(false) }, [tab])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Keyframes cho khung xương — khai báo một lần ở cấp trang */}
      <SkeletonStyles />

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[110] px-5 py-3 rounded-xl shadow-xl
          text-sm font-medium text-white max-w-[92vw] text-center
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Thanh tab ghim đỉnh — tự trượt lên khi cuộn, hiện lại khi ngừng cuộn */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 will-change-transform"
        style={{
          transform: navHidden ? `translateY(-${TAB_BAR_HEIGHT}px)` : 'translateY(0)',
          transition: 'transform .3s ease',
        }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ height: TAB_BAR_HEIGHT }}>
          {TABS.map(({ key, icon, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 h-full text-sm font-semibold
                border-b-2 -mb-px whitespace-nowrap shrink-0 transition-colors
                ${tab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <span>{icon}</span>{label}
            </button>
          ))}

          {/* Tài khoản đang đăng nhập + đăng xuất, ghim mép phải */}
          <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
            {auth?.username && (
              <span className="hidden sm:inline text-xs text-gray-400">
                👤 {auth.username}
              </span>
            )}
            <button onClick={handleLogout} title="Đăng xuất"
              className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-xs font-semibold
                text-gray-500 border border-gray-200 bg-white hover:text-red-600 hover:border-red-200
                active:scale-95 transition-colors">
              <span className="text-sm leading-none">⎋</span>
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>

      <div className={fullBleed
        ? 'w-full px-2 sm:px-4 lg:px-6 pb-4'
        : 'w-full px-4 sm:px-6 lg:px-8 pb-8'}>

        {tab === 'library' && (
          <MediaGallery
            refreshKey={refreshKey}
            onNotify={notify}
            topOffset={navHidden ? 0 : TAB_BAR_HEIGHT}
          />
        )}

        {tab === 'files' && (
          <FilesBrowser onNotify={notify} />
        )}

        {tab === 'office' && (
          <OfficeWorkspace onNotify={notify} />
        )}

        {tab === 'watermark' && (
          <div className="pt-3">
            <WatermarkEditor onSaved={handleSaved} onNotify={notify} />
          </div>
        )}
      </div>
    </div>
  )
}
