import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolsAuth } from '../../hooks/useToolsAuth'
import MediaGallery, { TAB_BAR_HEIGHT, toDateInput } from '../../components/media/MediaGallery'
import UploadModal from '../../components/media/UploadModal'
import DateRangePicker from '../../components/DateRangePicker'
import FilesBrowser from '../../components/files/FilesBrowser'
import OfficeWorkspace from '../../components/office/OfficeWorkspace'
import WatermarkEditor from '../../components/media/WatermarkEditor'
import { SkeletonStyles } from '../../components/common/Skeleton'

/**
 * Bộ tiện ích: Hình ảnh · Tệp · Office · Watermark.
 *
 * PANEL điều khiển (dòng tab + các nút chức năng) và THANH LỌC DƯỚI (năm/tháng/
 * ngày) tự ẩn khi cuộn, hiện lại khi ngừng cuộn — có animation mượt.
 */

const TABS = [
  { key: 'library',   icon: '🖼️', label: 'Hình ảnh' },
  { key: 'files',     icon: '📁', label: 'Tệp' },
  { key: 'office',    icon: '📊', label: 'Office' },
  { key: 'watermark', icon: '💧', label: 'Watermark' },
]

const FULL_BLEED = new Set(['office', 'watermark'])

const GRANS = [
  { key: 'year',  label: 'Năm' },
  { key: 'month', label: 'Tháng' },
  { key: 'day',   label: 'Ngày' },
]

export default function MediaPage() {
  const [tab, setTab] = useState('library')
  const [refreshKey, setRefresh] = useState(0)
  const [toast, setToast] = useState(null)

  const { auth, logout } = useToolsAuth()
  const navigate = useNavigate()

  // ── Bộ điều khiển thư viện (nâng lên đây để nằm chung một panel) ──
  const [showUpload, setUpload]   = useState(false)
  const [onlyFav, setOnlyFav]     = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch]       = useState('')
  const [dateOn, setDateOn]       = useState(false)
  const [from, setFrom]           = useState('')
  const [to, setTo]               = useState('')
  const [granularity, setGran]    = useState('month')

  // ── Panel tự ẩn khi cuộn, hiện lại khi ngừng ──
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

  // Đổi tab thì luôn cho panel hiện lại
  useEffect(() => { setNavHidden(false) }, [tab])

  const handleLogout = () => {
    logout()
    navigate('/tools/login', { replace: true })
  }

  const notify = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSaved = () => {
    setRefresh(k => k + 1)
    setTab('library')
  }

  const toggleDateFilter = () => {
    if (dateOn) { setDateOn(false); return }
    if (!from || !to) {
      const today = new Date()
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      setFrom(toDateInput(start))
      setTo(toDateInput(today))
    }
    setDateOn(true)
  }

  const isLibrary = tab === 'library'
  const fullBleed = FULL_BLEED.has(tab)

  return (
    <div className="min-h-screen bg-gray-50">
      <SkeletonStyles />

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[110] px-5 py-3 rounded-xl shadow-xl
          text-sm font-medium text-white max-w-[92vw] text-center
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* ══ PANEL TRÊN: dòng tab + các nút chức năng — tự trượt lên khi cuộn ══ */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 will-change-transform"
        style={{ transform: navHidden ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform .3s ease' }}>

        {/* Dòng 1 — đổi trang */}
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

          <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
            {auth?.username && (
              <span className="hidden sm:inline text-xs text-gray-400">👤 {auth.username}</span>
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

        {/* Dòng 2 — nút chức năng (chỉ ở tab Hình ảnh) */}
        {isLibrary && (
          <div className="w-full px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 border-t border-gray-100">
            <button onClick={() => setUpload(true)} title="Tải lên"
              className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-semibold
                flex items-center gap-1.5 active:scale-95 transition">
              <span className="text-base leading-none">＋</span>
              <span className="hidden xs:inline sm:inline">Tải lên</span>
            </button>

            <button onClick={() => setOnlyFav(f => !f)} title="Chỉ ảnh/video đã thả tim"
              className={`h-9 px-3 rounded-lg text-sm font-semibold border flex items-center gap-1.5
                active:scale-95 transition-colors
                ${onlyFav ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-gray-200 text-gray-500'}`}>
              <span className="text-base leading-none">{onlyFav ? '❤️' : '🤍'}</span>
              <span className="hidden sm:inline">Yêu thích</span>
            </button>

            <button onClick={() => setShowSearch(v => !v)} title="Tìm kiếm"
              className={`h-9 px-3 rounded-lg text-sm font-semibold border flex items-center gap-1.5
                active:scale-95 transition-colors
                ${showSearch || dateOn || search ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
              <span className="text-base leading-none">🔍</span>
              <span className="hidden sm:inline">Tìm kiếm</span>
            </button>
          </div>
        )}

        {/* Bảng tìm kiếm — hiện khi bật nút 🔍 */}
        {isLibrary && showSearch && (
          <div className="w-full px-4 sm:px-6 lg:px-8 pb-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo tên file..."
              className="flex-1 min-w-0 px-3.5 py-2 bg-white border border-gray-200 rounded-lg text-sm
                outline-none focus:border-blue-400 transition-colors placeholder:text-gray-300"
            />
            <div className="flex items-center gap-2">
              <button onClick={toggleDateFilter}
                className={`h-9 px-3 rounded-lg text-sm font-semibold border shrink-0 transition-colors
                  ${dateOn ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
                🗓 Theo ngày
              </button>
              {dateOn && (
                <DateRangePicker fromDate={from} toDate={to}
                  onChange={(f, t) => { setFrom(f); setTo(t) }} />
              )}
            </div>
          </div>
        )}
      </header>

      {/* ══ NỘI DUNG ══ */}
      <div className={fullBleed
        ? 'w-full px-2 sm:px-4 lg:px-6 pb-4'
        : `w-full px-4 sm:px-6 lg:px-8 ${isLibrary ? 'pb-24' : 'pb-8'}`}>

        {tab === 'library' && (
          <MediaGallery
            refreshKey={refreshKey}
            onNotify={notify}
            onlyFav={onlyFav}
            search={search}
            dateOn={dateOn}
            from={from}
            to={to}
            granularity={granularity}
          />
        )}

        {tab === 'files'  && <FilesBrowser onNotify={notify} />}
        {tab === 'office' && <OfficeWorkspace onNotify={notify} />}
        {tab === 'watermark' && (
          <div className="pt-3">
            <WatermarkEditor onSaved={handleSaved} onNotify={notify} />
          </div>
        )}
      </div>

      {/* ══ THANH LỌC DƯỚI: Năm / Tháng / Ngày — tự trượt xuống khi cuộn ══ */}
      {isLibrary && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200
          will-change-transform"
          style={{
            transform: navHidden ? 'translateY(100%)' : 'translateY(0)',
            transition: 'transform .3s ease',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}>
          <div className="w-full px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-center gap-2">
            {GRANS.map(({ key, label }) => (
              <button key={key} onClick={() => setGran(key)}
                className={`px-4 h-9 rounded-full text-sm font-semibold border transition-colors
                  ${granularity === key
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setUpload(false)}
          onDone={() => setRefresh(k => k + 1)}
          onNotify={notify}
        />
      )}
    </div>
  )
}
