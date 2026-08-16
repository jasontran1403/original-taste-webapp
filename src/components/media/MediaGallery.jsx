import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import {
  listMedia, deleteMedia, renameMedia, favoriteMedia, mediaUrl,
  deleteMediaBatch, mediaZipUrl,
} from '../../services/api'
import MediaLightbox from './MediaLightbox'
import { groupByDate } from './groupByDate'
import { SkeletonTiles } from '../common/Skeleton'
import { useSweepSelect } from '../../hooks/useSweepSelect'
import SelectionBar from '../common/SelectionBar'
import ConfirmModal from '../common/ConfirmModal'

/** Kích hoạt tải file qua thẻ <a> ẩn (server ép Content-Disposition nên tải thẳng) */
function triggerDownload(url) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Thư viện ảnh/video — cũ nhất ở trên, mới nhất ở đáy; mở trang cuộn sẵn xuống
 * đáy; cuộn LÊN để tải file cũ hơn.
 *
 *  • Luôn 5 ảnh/dòng, mỗi ảnh chừa ~5px xung quanh.
 *  • Mặc định tải 30 file gần nhất (6 dòng × 5).
 *  • Nếu nội dung chưa đầy màn hình → tự tải thêm cho đủ.
 *  • Ảnh đã thả tim → viền ĐỎ (không còn icon tim trên thumbnail). Thả/bỏ tim
 *    làm trong màn hình xem ảnh.
 *  • Cuộn lên tải thêm: KHÔNG hiện gì trong lúc chờ; khi có ảnh mới thì cuộn
 *    MƯỢT lên để lộ ảnh.
 *  • Lọc năm/tháng/ngày chỉ giới hạn mốc dưới `fromMs`; nếu khoảng đó chưa đủ
 *    30 file thì tự bỏ giới hạn để lấy thêm file gần đó (expandable).
 */

export const TAB_BAR_HEIGHT = 44

const COLUMNS = 5
const PAGE_SIZE = 30
const FILL_TARGET = 30
const SCROLL_TRIGGER = 400   // cách đỉnh dưới ngưỡng này thì tải thêm

function tileWidthFor(cols) {
  if (typeof window === 'undefined') return 120
  const w = window.innerWidth
  const pad = w < 640 ? 32 : w < 1024 ? 48 : 64
  const gap = 6
  return Math.max(0, (w - pad - gap * (cols - 1)) / cols)
}
const SHARP_TILE_PX = 190

/** HEIC/HEIF không render được trên Chrome/Firefox — luôn dùng thumbUrl (JPEG) */
const isHeic = it =>
  /\.hei[cf]$/i.test(it.originalName || '') ||
  /\.hei[cf]$/i.test(it.url || '') ||
  /heic|heif/i.test(it.contentType || '')

export const toDateInput = d => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MediaGallery({
  refreshKey, onNotify,
  onlyFav = false, search = '',
  fromMs = null, toMs = null,
  granularity = 'auto',
  expandable = false,
  filterNonce = 0,
}) {
  const [items, setItems]      = useState([])
  const [page, setPage]        = useState(0)
  const [totalPages, setTotal] = useState(0)
  const [totalCount, setCount] = useState(0)
  const [loading, setLoading]  = useState(true)
  const [lightbox, setLightbox] = useState(null)
  const [query, setQuery]      = useState('')
  const [expanded, setExpanded] = useState(false)

  const searchRef   = useRef(null)
  const loadingRef  = useRef(false)
  const pendingScroll = useRef(null)
  const freshCount  = useRef(0)
  const lightboxOpenRef = useRef(false)
  const smoothBottom = useRef(false)
  const prevNonce = useRef(filterNonce)
  const [loadingMore, setLoadingMore] = useState(false)
  /** ID của các item đã từng render — KHÔNG gán lại animation khi prepend */
  const renderedIds = useRef(new Set())
  lightboxOpenRef.current = lightbox !== null

  const sharp = tileWidthFor(COLUMNS) >= SHARP_TILE_PX

  const effFrom = expanded ? null : fromMs
  const effTo   = expanded ? null : toMs

  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(searchRef.current)
  }, [search])

  useEffect(() => {
    if (prevNonce.current !== filterNonce) {
      smoothBottom.current = true
      prevNonce.current = filterNonce
    }
  }, [filterNonce])

  useEffect(() => { setExpanded(false) }, [fromMs, toMs, expandable, filterNonce])

  const buildFilters = () => ({
    favorite: onlyFav,
    q: query,
    from: effFrom ?? null,
    to:   effTo ?? null,
  })

  /**
   * @param prepend true = chèn file cũ vào đầu, GIỮ nguyên vị trí (không tự cuộn)
   */
  const load = useCallback(async (targetPage, prepend) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!prepend) {
      setLoading(true)
      // Reset rendered IDs khi tải mới hoàn toàn (đổi filter / refresh)
      renderedIds.current = new Set()
    } else {
      setLoadingMore(true)
    }

    pendingScroll.current = prepend
      ? { prevHeight: document.documentElement.scrollHeight }
      : (smoothBottom.current ? 'bottom-smooth' : 'bottom')
    if (!prepend) smoothBottom.current = false

    try {
      const res = await listMedia(targetPage, PAGE_SIZE, buildFilters())
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      const batch = [...(d.content || [])].reverse()
      const total = d.totalElements || 0

      freshCount.current = prepend ? batch.length : 0
      setItems(prev => prepend ? [...batch, ...prev] : batch)
      setTotal(d.totalPages || 0)
      setCount(total)
      setPage(d.currentPage || 0)

      if (!prepend && expandable && !expanded && fromMs != null && total < FILL_TARGET) {
        setExpanded(true)
      }
    } catch (e) {
      pendingScroll.current = null
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      loadingRef.current = false
    }
  }, [onlyFav, query, effFrom, effTo, expandable, expanded, fromMs, onNotify])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load(0, false)
  }, [refreshKey, onlyFav, query, effFrom, effTo])   // eslint-disable-line react-hooks/exhaustive-deps

  // Sau khi DOM đổi:
  //  • lần đầu/đổi lọc → xuống đáy
  //  • chèn ở đầu       → GIỮ nguyên vị trí (không nhảy, KHÔNG tự cuộn)
  useLayoutEffect(() => {
    const action = pendingScroll.current
    if (!action) return
    pendingScroll.current = null

    if (action === 'bottom' || action === 'bottom-smooth') {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: action === 'bottom-smooth' ? 'smooth' : 'auto',
      })
      return
    }

    // prepend — bù đúng phần chiều cao vừa thêm để màn hình đứng yên
    const delta = document.documentElement.scrollHeight - action.prevHeight
    if (delta > 0) window.scrollTo(0, window.scrollY + delta)
  }, [items])

  // Nội dung chưa đầy màn hình → tự tải thêm cho đủ (không reveal, giữ đáy)
  useEffect(() => {
    if (loadingRef.current || loading) return
    if (lightboxOpenRef.current) return
    if (page >= totalPages - 1) return
    if (document.documentElement.scrollHeight <= window.innerHeight + 120) {
      load(page + 1, true)
    }
  }, [items, loading, page, totalPages, load])

  // Cuộn gần lên đỉnh → tải thêm file cũ hơn (chỉ chèn, KHÔNG tự cuộn)
  useEffect(() => {
    const onScroll = () => {
      if (lightboxOpenRef.current || loadingRef.current) return
      if (page >= totalPages - 1) return
      if (window.scrollY < SCROLL_TRIGGER) load(page + 1, true)
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

  // ── Chọn nhiều để tải/xóa hàng loạt ────────────────────────────
  const gridRef = useRef(null)
  const sel = useSweepSelect(gridRef)
  const [askDelete, setAskDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  // Đang chọn thì khoá lightbox (không mở khi bấm)
  const openItem = it => {
    if (sel.consumeClick()) return
    if (sel.selectMode) { sel.toggle(it.id); return }
    setLightbox(items.findIndex(x => x.id === it.id))
  }

  const selectedIds = () => [...sel.selected].map(Number)

  const downloadSelected = () => {
    const ids = selectedIds()
    if (ids.length === 0) return
    triggerDownload(mediaZipUrl(ids))
    onNotify?.(`Đang tải ${ids.length} mục...`)
  }

  const confirmDeleteSelected = async () => {
    const ids = selectedIds()
    setBusy(true)
    try {
      await deleteMediaBatch(ids)
      const rm = new Set(ids)
      setItems(prev => prev.filter(i => !rm.has(i.id)))
      setCount(c => Math.max(0, c - ids.length))
      setLightbox(null)
      onNotify?.(`Đã xóa ${ids.length} mục`)
      sel.exit()
    } catch {
      onNotify?.('Xóa thất bại', false)
    } finally {
      setBusy(false)
      setAskDelete(false)
    }
  }

  const hasFilter = onlyFav || query || fromMs != null
  const groups = groupByDate(items, Date.now(), granularity)
  const freshIds = new Set(items.slice(0, freshCount.current).map(i => i.id))

  // Đánh dấu các item đã từng render — chúng sẽ KHÔNG chạy animation và KHÔNG bị thay bằng skeleton
  useEffect(() => {
    items.forEach(it => renderedIds.current.add(it.id))
  }, [items])

  // Chỉ hiện skeleton toàn màn hình khi CHƯA CÓ item nào (lần đầu hoặc đổi filter)
  const showFullSkeleton = loading && items.length === 0

  return (
    <>
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
        .media-group-enter { animation: groupIn .2s ease both; }
        @media (prefers-reduced-motion: reduce) {
          .media-tile, .media-group-enter { animation: none; }
        }
      `}</style>

      <div className="pt-3" />

      {/* Skeleton khi đang tải thêm ở đỉnh (cuộn lên) — nằm TRÊN grid, không thay thế grid */}
      {loadingMore && (
        <div className="pt-1 pb-2"><SkeletonTiles count={10} /></div>
      )}

      {showFullSkeleton ? (
        <div className="pt-1"><SkeletonTiles count={20} /></div>
      ) : !loading && items.length === 0 ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">{hasFilter ? '🔍' : '🖼️'}</div>
          <p className="text-sm">{hasFilter ? 'Không có mục nào khớp bộ lọc' : 'Chưa có tài nguyên nào'}</p>
        </div>
      ) : items.length > 0 && (
        <div ref={gridRef} className="select-none"
          onContextMenu={e => e.preventDefault()}
          style={{
            touchAction: sel.selectMode ? 'none' : 'auto',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
          }}>
        {groups.map(group => {
          // Nhóm này có chứa item mới (vừa fetch) hay toàn item cũ (đã render)?
          const isNewGroup = group.items.every(it => freshIds.has(it.id))
          return (
          <section key={group.key} className={`mb-4 ${isNewGroup ? 'media-group-enter' : ''}`}>
            <h3 className="py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
              {group.label}
              <span className="ml-2 font-normal text-gray-300 normal-case">{group.items.length}</span>
            </h3>

            <div className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
              {group.items.map((it, idx) => {
                const picked = sel.isSelected(it.id)
                // Item mới (vừa prepend) VÀ chưa từng render → có animation
                const isNew = freshIds.has(it.id) && !renderedIds.current.has(it.id)
                return (
                <div key={it.id} data-select-id={it.id}
                  className={`relative aspect-square overflow-hidden bg-gray-100 rounded-lg group
                    ${isNew ? '' : 'media-tile'}
                    ${picked ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  style={isNew ? undefined : { animationDelay: `${Math.min(idx, 12) * 18}ms` }}>

                  <button onClick={() => openItem(it)} className="w-full h-full">
                    <img
                      src={mediaUrl(sharp && it.mediaType !== 'VIDEO' ? it.url : it.thumbUrl)}
                      alt={it.originalName}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      style={{ WebkitTouchCallout: 'none' }}
                      className={`w-full h-full object-cover transition
                        ${picked ? 'brightness-90 scale-95' : 'group-hover:brightness-90'}`}
                    />
                  </button>

                  {it.favorite && (
                    <span className="absolute inset-0 rounded-lg ring-2 ring-red-500 ring-inset pointer-events-none z-[2]" />
                  )}

                  {it.mediaType === 'VIDEO' && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-8 h-8 rounded-full bg-black/50 text-white text-xs flex items-center justify-center">▶</span>
                    </span>
                  )}

                  {it.source === 'WATERMARK' && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-blue-600/90 text-white text-[9px] font-bold pointer-events-none">
                      WM
                    </span>
                  )}

                  {/* Dấu tích khi đang ở chế độ chọn */}
                  {sel.selectMode && (
                    <span className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 flex items-center
                      justify-center text-[11px] pointer-events-none z-[3]
                      ${picked ? 'bg-blue-500 border-white text-white' : 'bg-black/30 border-white/80 text-transparent'}`}>
                      ✓
                    </span>
                  )}
                </div>
                )
              })}
            </div>
          </section>
          )
        })}
        </div>
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

      {sel.selectMode && (
        <SelectionBar
          count={sel.count}
          busy={busy}
          onCancel={sel.exit}
          onDeselectAll={sel.clearStay}
          onDownload={downloadSelected}
          onDelete={() => sel.count > 0 && setAskDelete(true)}
        />
      )}

      <ConfirmModal
        open={askDelete}
        danger
        title={`Xóa ${sel.count} mục?`}
        message="Các ảnh/video đã chọn sẽ bị xóa vĩnh viễn và không thể khôi phục."
        confirmLabel="Xóa"
        busy={busy}
        onConfirm={confirmDeleteSelected}
        onCancel={() => setAskDelete(false)}
      />
    </>
  )
}