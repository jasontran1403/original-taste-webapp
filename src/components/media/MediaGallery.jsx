import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import {
  listMedia, deleteMedia, renameMedia, favoriteMedia, mediaUrl,
} from '../../services/api'
import MediaLightbox from './MediaLightbox'
import { groupByDate } from './groupByDate'
import { SkeletonTiles } from '../common/Skeleton'
import { withMinDelay, MIN_LOADING_MS } from '../../lib/timing'

/**
 * Thư viện ảnh/video — cũ nhất ở trên, mới nhất ở đáy; mở trang cuộn sẵn xuống
 * đáy; cuộn LÊN để tải file cũ hơn.
 *
 *  • Luôn 5 ảnh/dòng, mỗi ảnh chừa ~5px xung quanh.
 *  • Mặc định tải 30 file gần nhất (6 dòng × 5).
 *  • Nếu nội dung chưa đầy màn hình → tự tải thêm cho đủ.
 *  • Bộ lọc năm/tháng/ngày (từ MediaPage) chỉ giới hạn mốc dưới `fromMs`; nếu
 *    khoảng đó chưa đủ 30 file thì tự bỏ giới hạn để lấy thêm file gần đó
 *    (expandable), gom nhóm theo đúng năm/tháng/ngày đã chọn.
 */

export const TAB_BAR_HEIGHT = 44

/** Luôn 5 ảnh trên một dòng */
const COLUMNS = 5
/** Tải 30 file mỗi lần (6 dòng × 5) */
const PAGE_SIZE = 30
/** Ngưỡng "đủ một trang" để quyết định có tải thêm không */
const FILL_TARGET = 30

/** Bề rộng thật (CSS px) của một ô — để biết khi nào cần dùng ảnh gốc cho nét */
function tileWidthFor(cols) {
  if (typeof window === 'undefined') return 120
  const w = window.innerWidth
  const pad = w < 640 ? 32 : w < 1024 ? 48 : 64
  const gap = 6
  return Math.max(0, (w - pad - gap * (cols - 1)) / cols)
}
const SHARP_TILE_PX = 190

/** Date → 'YYYY-MM-DD' theo giờ máy */
export const toDateInput = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MediaGallery({
  refreshKey, onNotify,
  onlyFav = false, search = '',
  fromMs = null, toMs = null,
  granularity = 'auto',
  expandable = false,     // true khi đang lọc năm/tháng/ngày → cho phép nới ra nếu < 30
  filterNonce = 0,        // đổi mỗi lần bấm nút lọc → kích hoạt cuộn mượt xuống đáy
}) {
  const [items, setItems]      = useState([])
  const [page, setPage]        = useState(0)
  const [totalPages, setTotal] = useState(0)
  const [totalCount, setCount] = useState(0)
  const [loading, setLoading]  = useState(true)
  const [prepending, setPrepend] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [query, setQuery]      = useState('')
  const [expanded, setExpanded] = useState(false)   // đã bỏ giới hạn mốc dưới chưa

  const searchRef   = useRef(null)
  const loadingRef  = useRef(false)
  const pendingScroll = useRef(null)
  const freshCount  = useRef(0)
  const lightboxOpenRef = useRef(false)
  const smoothBottom = useRef(false)
  const prevNonce = useRef(filterNonce)
  lightboxOpenRef.current = lightbox !== null

  const gapped = true                       // luôn có khoảng cách ~5px
  const sharp  = tileWidthFor(COLUMNS) >= SHARP_TILE_PX

  // Khi đang lọc mà khoảng chọn ít hơn 30 file thì bỏ giới hạn để lấy thêm
  const effFrom = expanded ? null : fromMs
  const effTo   = expanded ? null : toMs

  // Debounce ô tìm theo tên
  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(searchRef.current)
  }, [search])

  // Bấm nút lọc (đổi filterNonce) → lần tải kế tiếp cuộn MƯỢT xuống đáy
  useEffect(() => {
    if (prevNonce.current !== filterNonce) {
      smoothBottom.current = true
      prevNonce.current = filterNonce
    }
  }, [filterNonce])

  // Đổi mốc lọc → bỏ trạng thái "đã nới"
  useEffect(() => { setExpanded(false) }, [fromMs, toMs, expandable, filterNonce])

  const buildFilters = () => ({
    favorite: onlyFav,
    q: query,
    from: effFrom ?? null,
    to:   effTo ?? null,
  })

  const load = useCallback(async (targetPage, prepend) => {
    if (loadingRef.current) return
    loadingRef.current = true
    prepend ? setPrepend(true) : setLoading(true)

    pendingScroll.current = prepend
      ? { prevHeight: document.documentElement.scrollHeight }
      : (smoothBottom.current ? 'bottom-smooth' : 'bottom')
    if (!prepend) smoothBottom.current = false

    try {
      const request = listMedia(targetPage, PAGE_SIZE, buildFilters())
      const res = prepend ? await withMinDelay(request, MIN_LOADING_MS) : await request
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      const batch = [...(d.content || [])].reverse()   // API mới→cũ → đảo thành cũ→mới
      const total = d.totalElements || 0

      freshCount.current = prepend ? batch.length : 0
      setItems(prev => prepend ? [...batch, ...prev] : batch)
      setTotal(d.totalPages || 0)
      setCount(total)
      setPage(d.currentPage || 0)

      // Đang lọc mà khoảng chọn chưa đủ 30 → bỏ giới hạn, lấy thêm file gần đó
      if (!prepend && expandable && !expanded && fromMs != null && total < FILL_TARGET) {
        setExpanded(true)
      }
    } catch (e) {
      pendingScroll.current = null
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
      setPrepend(false)
      loadingRef.current = false
    }
  }, [onlyFav, query, effFrom, effTo, expandable, expanded, fromMs, onNotify])   // eslint-disable-line react-hooks/exhaustive-deps

  // Đổi bộ lọc → tải lại từ đầu
  useEffect(() => {
    load(0, false)
  }, [refreshKey, onlyFav, query, effFrom, effTo])   // eslint-disable-line react-hooks/exhaustive-deps

  // Sau khi DOM đổi: lần đầu/đổi lọc → xuống đáy; chèn ở đầu → bù scrollTop
  useLayoutEffect(() => {
    const action = pendingScroll.current
    if (!action) return
    pendingScroll.current = null
    if (action === 'bottom' || action === 'bottom-smooth') {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: action === 'bottom-smooth' ? 'smooth' : 'auto',
      })
    } else {
      const delta = document.documentElement.scrollHeight - action.prevHeight
      if (delta > 0) window.scrollTo({ top: window.scrollY + delta, behavior: 'auto' })
    }
  }, [items])

  // Nếu nội dung CHƯA đầy màn hình → tự tải thêm cho đủ (giải quyết cả việc
  // desktop không có gì để cuộn nên không kích hoạt tải thêm)
  useEffect(() => {
    if (loadingRef.current || loading || prepending) return
    if (lightboxOpenRef.current) return
    if (page >= totalPages - 1) return
    if (document.documentElement.scrollHeight <= window.innerHeight + 120) {
      load(page + 1, true)
    }
  }, [items, loading, prepending, page, totalPages, load])

  // Cuộn gần lên đỉnh → tải thêm file cũ hơn.
  // Khi lightbox mở thì KHÔNG tải (nền bị khoá position:fixed làm scrollY về 0,
  // bắn sự kiện scroll — nếu không chặn sẽ chèn ảnh cũ vào đầu, lệch chỉ số).
  useEffect(() => {
    const onScroll = () => {
      if (lightboxOpenRef.current || loadingRef.current) return
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

  const hasFilter = onlyFav || query || fromMs != null
  const hasMore = page < totalPages - 1
  const groups = groupByDate(items, Date.now(), granularity)
  const freshIds = new Set(items.slice(0, freshCount.current).map(i => i.id))

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

      {/* Chừa khoảng trên để hàng ảnh đầu không dính sát cụm nút chức năng */}
      <div className="pt-3" />

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
        <div className="pt-1"><SkeletonTiles count={20} /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">{hasFilter ? '🔍' : '🖼️'}</div>
          <p className="text-sm">{hasFilter ? 'Không có mục nào khớp bộ lọc' : 'Chưa có tài nguyên nào'}</p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="mb-4 media-group">
            <h3 className="py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
              {group.label}
              <span className="ml-2 font-normal text-gray-300 normal-case">{group.items.length}</span>
            </h3>

            <div className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
              {group.items.map((it, idx) => (
                <div key={it.id}
                  className={`relative aspect-square overflow-hidden bg-gray-100 rounded-lg group
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

                  {it.mediaType === 'VIDEO' && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-8 h-8 rounded-full bg-black/50 text-white text-xs flex items-center justify-center">▶</span>
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