import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import {
  listMedia, deleteMedia, renameMedia, favoriteMedia, mediaUrl,
} from '../../services/api'
import MediaLightbox from './MediaLightbox'
import { groupByDate } from './groupByDate'
import { SkeletonTiles } from '../common/Skeleton'
import { withMinDelay, MIN_LOADING_MS } from '../../lib/timing'

/**
 * Thư viện ảnh/video, bố cục theo ứng dụng Ảnh của iPhone: cũ nhất ở trên, mới
 * nhất ở góc dưới phải; mở trang cuộn sẵn xuống đáy; cuộn LÊN để tải file cũ hơn.
 *
 * SỐ ẢNH TRÊN MỘT DÒNG tự đổi theo tổng số mục (KHÔNG còn zoom bằng tay):
 *   < 20        → 4 ảnh/dòng (có khoảng cách giữa các ảnh)
 *   20 – 40     → 8 ảnh/dòng (sát nhau)
 *   40 – 100    → 16 ảnh/dòng (sát nhau)
 *   > 100       → 32 ảnh/dòng (sát nhau)
 *
 * Bộ lọc (yêu thích / tìm kiếm / khoảng ngày) và độ chi tiết nhóm (năm/tháng/
 * ngày) được truyền từ MediaPage xuống qua props.
 */

export const TAB_BAR_HEIGHT = 44

/** Số cột theo breakpoint — chỉ dùng để ƯỚC LƯỢNG cỡ trang tải mỗi lần */
function columnsFor(width) {
  if (width < 640)  return 3
  if (width < 768)  return 4
  if (width < 1024) return 5
  if (width < 1280) return 6
  return 8
}

/** Số ẢNH TRÊN MỘT DÒNG theo tổng số mục */
function columnsForCount(n) {
  if (n < 20)  return 4
  if (n <= 40) return 8
  if (n <= 100) return 16
  return 32
}

function computePageSize() {
  if (typeof window === 'undefined') return 24
  const w = window.innerWidth
  const cols = columnsFor(w)
  const horizontalPadding = w < 640 ? 32 : 64
  const gap = w < 640 ? 6 : 8
  const tile = Math.max(60, (w - horizontalPadding - gap * (cols - 1)) / cols)
  const rows = Math.ceil(window.innerHeight / (tile + gap)) + 1
  return Math.min(100, Math.max(12, cols * rows))
}

/** Bề rộng THẬT (CSS px) của một ô theo số cột — để biết khi nào cần ảnh gốc */
function tileWidthFor(cols) {
  if (typeof window === 'undefined') return 120
  const w = window.innerWidth
  const pad = w < 640 ? 32 : w < 1024 ? 48 : 64
  const gap = cols === 4 ? (w < 640 ? 6 : 8) : 0
  return Math.max(0, (w - pad - gap * (cols - 1)) / cols)
}

/** Ô rộng hơn ngưỡng này thì thumbnail bị mờ → dùng ảnh gốc cho nét */
const SHARP_TILE_PX = 190

/** Date → 'YYYY-MM-DD' theo giờ máy */
export const toDateInput = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MediaGallery({
  refreshKey, onNotify,
  onlyFav = false, search = '', dateOn = false, from = '', to = '',
  granularity = 'month',
}) {
  const [items, setItems]      = useState([])   // thứ tự HIỂN THỊ: cũ → mới
  const [page, setPage]        = useState(0)
  const [totalPages, setTotal] = useState(0)
  const [totalCount, setCount] = useState(0)
  const [loading, setLoading]  = useState(true)
  const [prepending, setPrepend] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [query, setQuery]      = useState('')

  const searchRef   = useRef(null)
  const pageSizeRef = useRef(computePageSize())
  const loadingRef  = useRef(false)
  const pendingScroll = useRef(null)
  const freshCount  = useRef(0)
  const lightboxOpenRef = useRef(false)
  lightboxOpenRef.current = lightbox !== null   // luôn cập nhật cho handler cuộn

  // Số ảnh/dòng theo tổng số mục + có khoảng cách hay không
  const columns = columnsForCount(totalCount)
  const gapped  = columns === 4                 // chỉ 4 ảnh/dòng mới chừa khoảng cách
  const sharp   = tileWidthFor(columns) >= SHARP_TILE_PX

  // Gõ tới đâu gọi API tới đó thì vừa giật vừa tốn request → chờ 400ms
  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(searchRef.current)
  }, [search])

  useEffect(() => {
    const onResize = () => { pageSizeRef.current = computePageSize() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const buildFilters = () => ({
    favorite: onlyFav,
    q: query,
    from: dateOn && from ? new Date(from + 'T00:00:00').getTime() : null,
    to:   dateOn && to   ? new Date(to   + 'T23:59:59').getTime() : null,
  })

  const load = useCallback(async (targetPage, prepend) => {
    if (loadingRef.current) return
    loadingRef.current = true
    prepend ? setPrepend(true) : setLoading(true)

    pendingScroll.current = prepend
      ? { prevHeight: document.documentElement.scrollHeight }
      : 'bottom'

    try {
      const request = listMedia(targetPage, pageSizeRef.current, buildFilters())
      const res = prepend ? await withMinDelay(request, MIN_LOADING_MS) : await request
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      const batch = [...(d.content || [])].reverse()   // API mới→cũ, đảo thành cũ→mới

      freshCount.current = prepend ? batch.length : 0
      setItems(prev => prepend ? [...batch, ...prev] : batch)
      setTotal(d.totalPages || 0)
      setCount(d.totalElements || 0)
      setPage(d.currentPage || 0)
    } catch (e) {
      pendingScroll.current = null
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
      setPrepend(false)
      loadingRef.current = false
    }
  }, [onlyFav, query, dateOn, from, to, onNotify])   // eslint-disable-line react-hooks/exhaustive-deps

  // Đổi bộ lọc → tải lại từ đầu
  useEffect(() => {
    pageSizeRef.current = computePageSize()
    load(0, false)
  }, [refreshKey, onlyFav, query, dateOn, from, to])   // eslint-disable-line react-hooks/exhaustive-deps

  // Sau khi DOM đổi: lần đầu/đổi lọc → xuống đáy; chèn ở đầu → bù scrollTop
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

  // Cuộn gần lên đỉnh → tải thêm file cũ hơn.
  // QUAN TRỌNG: khi lightbox đang mở, KHÔNG tải thêm. Lúc mở lightbox, nền bị
  // khoá bằng position:fixed khiến scrollY về 0 và bắn sự kiện scroll — nếu
  // không chặn thì đây sẽ prepend một lô ảnh cũ vào đầu, làm lệch chỉ số ảnh
  // đang xem (đang xem tấm cuối tự nhảy về tấm khác).
  useEffect(() => {
    const onScroll = () => {
      if (lightboxOpenRef.current) return
      if (loadingRef.current) return
      if (page >= totalPages - 1) return
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

  const hasFilter = onlyFav || query || dateOn
  const hasMore = page < totalPages - 1
  const groups = groupByDate(items, Date.now(), granularity)
  const freshIds = new Set(items.slice(0, freshCount.current).map(i => i.id))

  const showHeart = columns <= 4     // ô đủ to mới hiện nút tim / nhãn WM
  const showPlay  = columns <= 8     // ô quá nhỏ thì bỏ luôn dấu ▶

  return (
    <>
      <style>{`
        @keyframes mediaIn {
          from { opacity: 0; transform: scale(.94) translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes mediaInTop {
          from { opacity: 0; transform: translateY(-14px) scale(.96); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes groupIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
        .media-tile  { animation: mediaIn .26s cubic-bezier(.2,.8,.3,1) both; }
        .media-tile-new { animation: mediaInTop .34s cubic-bezier(.2,.8,.3,1) both; }
        .media-group { animation: groupIn .2s ease both; }
        @media (prefers-reduced-motion: reduce) {
          .media-tile, .media-tile-new, .media-group { animation: none; }
        }
      `}</style>

      {/* Báo còn file cũ hơn — ở TRÊN vì trang sắp cũ→mới, cuộn LÊN mới tải thêm */}
      {hasMore && !loading && (
        <div className="py-3 text-center">
          {prepending ? (
            <span className="inline-flex items-center gap-2 text-xs text-gray-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
              Đang tải thêm...
            </span>
          ) : (
            <span className="text-xs text-gray-300">↑ Cuộn lên để xem file cũ hơn</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="pt-3"><SkeletonTiles count={24} /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">{hasFilter ? '🔍' : '🖼️'}</div>
          <p className="text-sm">{hasFilter ? 'Không có mục nào khớp bộ lọc' : 'Chưa có tài nguyên nào'}</p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="mb-4 media-group">
            <h3 className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-1.5
              bg-gray-50/95 backdrop-blur text-xs font-bold text-gray-500 uppercase tracking-wider">
              {group.label}
              <span className="ml-2 font-normal text-gray-300 normal-case">{group.items.length}</span>
            </h3>

            <div className={`grid mt-2 ${gapped ? 'gap-1.5 sm:gap-2' : 'gap-0'}`}
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {group.items.map((it, idx) => (
                <div key={it.id}
                  className={`relative aspect-square overflow-hidden bg-gray-100 group
                    ${gapped ? 'rounded-lg' : 'rounded-none'}
                    ${freshIds.has(it.id) ? 'media-tile-new' : 'media-tile'}`}
                  style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}>

                  <button onClick={() => setLightbox(items.findIndex(x => x.id === it.id))}
                    className="w-full h-full">
                    <img
                      src={mediaUrl(sharp && it.mediaType !== 'VIDEO' ? it.url : it.thumbUrl)}
                      alt={it.originalName}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:brightness-90 transition"
                    />
                  </button>

                  {it.mediaType === 'VIDEO' && showPlay && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className={`rounded-full bg-black/50 text-white flex items-center justify-center
                        ${columns <= 4 ? 'w-8 h-8 text-xs' : 'w-5 h-5 text-[8px]'}`}>▶</span>
                    </span>
                  )}

                  {showHeart && (
                    <button onClick={() => handleFavorite(it)}
                      aria-label={it.favorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                      className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-black/35 backdrop-blur-sm
                        flex items-center justify-center text-xs active:scale-90 transition">
                      {it.favorite ? '❤️' : '🤍'}
                    </button>
                  )}

                  {it.source === 'WATERMARK' && showHeart && (
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
