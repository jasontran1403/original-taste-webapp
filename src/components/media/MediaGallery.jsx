import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import {
  listMedia, deleteMedia, renameMedia, favoriteMedia, mediaUrl,
} from '../../services/api'
import MediaLightbox from './MediaLightbox'
import UploadModal from './UploadModal'
import DateRangePicker from '../DateRangePicker'
import { groupByDate } from './groupByDate'

/**
 * Thư viện ảnh/video, bố cục theo đúng ứng dụng Ảnh của iPhone:
 *
 *   • File CŨ NHẤT ở trên, MỚI NHẤT ở góc dưới bên phải.
 *   • Mở trang là cuộn sẵn xuống đáy (chỗ file mới nhất).
 *   • Cuộn LÊN để tải thêm file cũ hơn.
 *
 * Vì thứ tự ngược với thứ tự API trả về (mới nhất trước), dữ liệu được đảo lại
 * khi lưu vào state: `items` luôn ở thứ tự HIỂN THỊ (cũ → mới), trang sau được
 * chèn vào ĐẦU mảng.
 *
 * Số file tải mỗi lần tính theo kích thước màn hình, đủ phủ một màn hình cộng
 * một hàng đệm — điện thoại 3 cột lấy ~15 file, màn hình lớn 8 cột lấy nhiều
 * hơn. Lấy cứng 60 file như trước thì điện thoại tải thừa, còn màn 4K lại thiếu.
 */

/** Số cột phải khớp với các breakpoint của lưới bên dưới */
function columnsFor(width) {
  if (width < 640)  return 3   // grid-cols-3
  if (width < 768)  return 4   // sm:grid-cols-4
  if (width < 1024) return 5   // md:grid-cols-5
  if (width < 1280) return 6   // lg:grid-cols-6
  return 8                     // xl:grid-cols-8
}

function computePageSize() {
  if (typeof window === 'undefined') return 24
  const w = window.innerWidth
  const cols = columnsFor(w)

  const horizontalPadding = w < 640 ? 32 : 64
  const gap = w < 640 ? 6 : 8
  const tile = Math.max(60, (w - horizontalPadding - gap * (cols - 1)) / cols)

  // +1 hàng đệm để cuộn nhẹ đã có sẵn nội dung, chưa phải chờ tải
  const rows = Math.ceil(window.innerHeight / (tile + gap)) + 1

  // Backend giới hạn 100/lần
  return Math.min(100, Math.max(12, cols * rows))
}

/** Date → 'YYYY-MM-DD' theo giờ máy (toISOString quy về UTC nên lệch ngày) */
const toDateInput = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MediaGallery({ refreshKey, onNotify }) {
  const [items, setItems]      = useState([])   // thứ tự HIỂN THỊ: cũ → mới
  const [page, setPage]        = useState(0)
  const [totalPages, setTotal] = useState(0)
  const [totalCount, setCount] = useState(0)
  const [loading, setLoading]  = useState(false)
  const [showUpload, setUpload] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  // Bộ lọc
  const [onlyFav, setOnlyFav] = useState(false)
  const [search, setSearch]   = useState('')
  const [query, setQuery]     = useState('')
  const [dateOn, setDateOn]   = useState(false)
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')

  const searchRef   = useRef(null)
  const pageSizeRef = useRef(computePageSize())
  const loadingRef  = useRef(false)          // chặn gọi trùng khi cuộn nhanh
  const pendingScroll = useRef(null)         // 'bottom' | { prevHeight }

  // Gõ tới đâu gọi API tới đó thì vừa giật vừa tốn request → chờ 400ms
  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(searchRef.current)
  }, [search])

  // Xoay ngang/dọc hoặc đổi cỡ cửa sổ → số cột đổi → tính lại cỡ trang
  useEffect(() => {
    const onResize = () => { pageSizeRef.current = computePageSize() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const buildFilters = () => ({
    favorite: onlyFav,
    q: query,
    // 'to' phải lấy hết 23:59:59, không thì chọn cùng một ngày cho cả hai đầu
    // sẽ không ra kết quả nào
    from: dateOn && from ? new Date(from + 'T00:00:00').getTime() : null,
    to:   dateOn && to   ? new Date(to   + 'T23:59:59').getTime() : null,
  })

  /**
   * @param targetPage 0 = mới nhất
   * @param prepend true = chèn file cũ hơn vào đầu danh sách
   */
  const load = useCallback(async (targetPage, prepend) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)

    // Ghi lại chiều cao trang TRƯỚC khi chèn, để giữ nguyên vị trí đang xem
    pendingScroll.current = prepend
      ? { prevHeight: document.documentElement.scrollHeight }
      : 'bottom'

    try {
      const res = await listMedia(targetPage, pageSizeRef.current, buildFilters())
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env

      // API trả mới → cũ; đảo lại thành cũ → mới cho đúng thứ tự hiển thị
      const batch = [...(d.content || [])].reverse()

      setItems(prev => prepend ? [...batch, ...prev] : batch)
      setTotal(d.totalPages || 0)
      setCount(d.totalElements || 0)
      setPage(d.currentPage || 0)
    } catch (e) {
      pendingScroll.current = null
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [onlyFav, query, dateOn, from, to, onNotify])   // eslint-disable-line react-hooks/exhaustive-deps

  // Đổi bộ lọc → tải lại từ đầu
  useEffect(() => {
    pageSizeRef.current = computePageSize()
    load(0, false)
  }, [refreshKey, onlyFav, query, dateOn, from, to])   // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Sau khi DOM cập nhật:
   *  • Tải lần đầu / đổi lọc → nhảy xuống đáy (chỗ file mới nhất).
   *  • Chèn file cũ ở đầu   → bù lại scrollTop đúng bằng phần chiều cao vừa
   *    thêm vào, nếu không màn hình sẽ nhảy vọt và mất chỗ đang xem.
   * Dùng useLayoutEffect để chỉnh trước khi trình duyệt vẽ, không thấy giật.
   */
  useLayoutEffect(() => {
    const action = pendingScroll.current
    if (!action) return
    pendingScroll.current = null

    if (action === 'bottom') {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' })
    } else {
      const delta = document.documentElement.scrollHeight - action.prevHeight
      if (delta > 0) window.scrollTo({ top: window.scrollY + delta, behavior: 'auto' })
    }
  }, [items])

  // Cuộn gần lên đỉnh → tải thêm file cũ hơn
  useEffect(() => {
    const onScroll = () => {
      if (loadingRef.current) return
      if (page >= totalPages - 1) return          // hết dữ liệu
      if (window.scrollY < 400) load(page + 1, true)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [page, totalPages, load])

  // ── Thao tác ────────────────────────────────────────────────────

  const handleDelete = async asset => {
    try {
      await deleteMedia(asset.id)
      setLightbox(null)
      setItems(prev => prev.filter(i => i.id !== asset.id))
      setCount(c => Math.max(0, c - 1))
      onNotify?.('Đã xóa')
    } catch {
      onNotify?.('Xóa thất bại', false)
    }
  }

  const handleRename = async (asset, name) => {
    try {
      const res = await renameMedia(asset.id, name)
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const updated = env?.data ?? env
      setItems(prev => prev.map(i => i.id === asset.id ? { ...i, ...updated } : i))
      onNotify?.('Đã đổi tên')
    } catch (e) {
      onNotify?.(e.message || 'Đổi tên thất bại', false)
    }
  }

  const handleFavorite = async asset => {
    const next = !asset.favorite
    // Cập nhật lạc quan để bấm tim không khựng; hỏng thì trả lại trạng thái cũ
    setItems(prev => prev.map(i => i.id === asset.id ? { ...i, favorite: next } : i))
    try {
      await favoriteMedia(asset.id, next)
      if (onlyFav && !next) {
        setItems(prev => prev.filter(i => i.id !== asset.id))
        setLightbox(null)
      }
    } catch {
      setItems(prev => prev.map(i => i.id === asset.id ? { ...i, favorite: !next } : i))
      onNotify?.('Không cập nhật được', false)
    }
  }

  /** Bật lọc ngày → mặc định 30 ngày gần nhất, TÍNH CẢ HÔM NAY */
  const toggleDateFilter = () => {
    if (dateOn) { setDateOn(false); return }
    if (!from || !to) {
      const today = new Date()
      const start = new Date(today)
      start.setDate(start.getDate() - 29)   // 29 vì hôm nay đã là ngày thứ 30
      setFrom(toDateInput(start))
      setTo(toDateInput(today))
    }
    setDateOn(true)
  }

  const clearFilters = () => {
    setOnlyFav(false); setSearch(''); setQuery('')
    setDateOn(false); setFrom(''); setTo('')
  }

  const hasFilter = onlyFav || query || dateOn
  const hasMore = page < totalPages - 1
  const groups = groupByDate(items)   // items đã ở thứ tự cũ → mới

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      {/*
        Keyframes đặt ngay tại đây để component tự chứa, khỏi phải nhớ sửa
        index.css. Độ trễ theo vị trí tạo cảm giác lưới "chạy" vào, nhưng chặn
        ở 12 ô — ô thứ 60 mà trễ 60×18ms thì người dùng tưởng lỗi tải.
      */}
      <style>{`
        @keyframes mediaIn {
          from { opacity: 0; transform: scale(.94) translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes groupIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
        .media-tile  { animation: mediaIn .26s cubic-bezier(.2,.8,.3,1) both; }
        .media-group { animation: groupIn .2s ease both; }
        @media (prefers-reduced-motion: reduce) {
          .media-tile, .media-group { animation: none; }
        }
      `}</style>

      {/* Thanh hành động */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setUpload(true)} className="btn-primary">⬆ Tải lên</button>

        <button onClick={() => setOnlyFav(f => !f)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors
            ${onlyFav ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-gray-200 text-gray-500'}`}>
          {onlyFav ? '❤️ Yêu thích' : '🤍 Yêu thích'}
        </button>

        <button onClick={toggleDateFilter}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors
            ${dateOn ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
          🗓 Thời gian
        </button>

        {dateOn && (
          <DateRangePicker fromDate={from} toDate={to}
            onChange={(f, t) => { setFrom(f); setTo(t) }} />
        )}

        <span className="text-sm text-gray-400 ml-auto">{totalCount} mục</span>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Tìm theo tên file..."
        className="w-full mb-3 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none
          focus:border-blue-400 transition-colors placeholder:text-gray-300"
      />

      {hasFilter && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span>Đang lọc</span>
          <button onClick={clearFilters} className="text-blue-600 font-semibold hover:underline">
            Bỏ tất cả bộ lọc
          </button>
        </div>
      )}

      {/* Báo còn file cũ hơn ở phía trên */}
      {hasMore && (
        <div className="py-3 text-center text-xs text-gray-400">
          {loading ? 'Đang tải thêm...' : '↑ Cuộn lên để xem file cũ hơn'}
        </div>
      )}

      {items.length === 0 && !loading ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">{hasFilter ? '🔍' : '🖼️'}</div>
          <p className="text-sm">{hasFilter ? 'Không có mục nào khớp bộ lọc' : 'Chưa có tài nguyên nào'}</p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="mb-5 media-group">
            {/* Tiêu đề dính — cuộn tới đâu thấy mốc thời gian tới đó */}
            <h3 className="sticky top-14 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-1.5
              bg-gray-50/95 backdrop-blur text-xs font-bold text-gray-500 uppercase tracking-wider">
              {group.label}
              <span className="ml-2 font-normal text-gray-300 normal-case">{group.items.length}</span>
            </h3>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 mt-2">
              {group.items.map((it, idx) => (
                <div key={it.id}
                  className="media-tile relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
                  style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}>

                  <button onClick={() => setLightbox(items.findIndex(x => x.id === it.id))}
                    className="w-full h-full">
                    <img
                      src={mediaUrl(it.thumbUrl)}
                      alt={it.originalName}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:brightness-90 transition"
                    />
                  </button>

                  {it.mediaType === 'VIDEO' && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-8 h-8 rounded-full bg-black/50 text-white text-xs flex items-center justify-center">
                        ▶
                      </span>
                    </span>
                  )}

                  <button onClick={() => handleFavorite(it)}
                    aria-label={it.favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                    className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-black/35 backdrop-blur-sm
                      flex items-center justify-center text-xs active:scale-90 transition">
                    {it.favorite ? '❤️' : '🤍'}
                  </button>

                  {it.source === 'WATERMARK' && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-blue-600/90 text-white text-[9px] font-bold pointer-events-none">
                      WM
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setUpload(false)}
          onDone={() => load(0, false)}
          onNotify={onNotify}
        />
      )}

      {lightbox !== null && items[lightbox] && (
        <MediaLightbox
          items={items}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          onDelete={handleDelete}
          onRename={handleRename}
          onFavorite={handleFavorite}
        />
      )}
    </>
  )
}