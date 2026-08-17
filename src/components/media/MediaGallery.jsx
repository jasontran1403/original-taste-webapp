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
import AlbumPickerModal from './AlbumPickerModal'

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
 * Thư viện ảnh/video — tải TẤT CẢ file danh sách 1 lần duy nhất.
 * Thumbnail/ảnh chỉ load khi cuộn đến (lazy loading qua IntersectionObserver).
 *
 *  • Luôn 5 ảnh/dòng, mỗi ảnh chừa ~5px xung quanh.
 *  • Ảnh đã thả tim → viền ĐỎ.
 *  • Khi bật/tắt filter yêu thích → animation biến mất/hiện lại từng ảnh.
 */

export const TAB_BAR_HEIGHT = 44

const COLUMNS = 5
const PAGE_SIZE = 200000

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
  albumId = null,
}) {
  // allItems = toàn bộ file lấy từ server, items = sau khi filter client-side (yêu thích)
  const [allItems, setAllItems] = useState([])
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [lightbox, setLightbox] = useState(null)
  const [query, setQuery]       = useState('')

  const searchRef     = useRef(null)
  const loadingRef    = useRef(false)
  const lightboxOpenRef = useRef(false)
  lightboxOpenRef.current = lightbox !== null

  // Animated favorite filter
  const [favAnimating, setFavAnimating] = useState(false)
  const prevFav = useRef(onlyFav)

  const sharp = tileWidthFor(COLUMNS) >= SHARP_TILE_PX

  // Debounce search
  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(searchRef.current)
  }, [search])

  const buildFilters = useCallback(() => ({
    // Không gửi favorite lên server nữa, filter ở client để có animation
    q: query,
    from: fromMs ?? null,
    to:   toMs ?? null,
    albumId: albumId ?? null,
  }), [query, fromMs, toMs, albumId])

  /**
   * Tải toàn bộ danh sách file 1 lần. Chỉ gọi lại khi đổi filter server-side
   * (search, date range, album). Filter yêu thích xử lý ở client.
   */
  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const res = await listMedia(0, PAGE_SIZE, buildFilters())
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      const batch = [...(d.content || [])].reverse()
      setAllItems(batch)
    } catch (e) {
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [buildFilters, onNotify])

  // Fetch khi đổi filter server-side hoặc refreshKey
  useEffect(() => {
    load()
  }, [refreshKey, query, fromMs, toMs, albumId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side filter: yêu thích
  useEffect(() => {
    // Detect animation transition
    if (prevFav.current !== onlyFav) {
      setFavAnimating(true)
      setTimeout(() => setFavAnimating(false), 350)
      prevFav.current = onlyFav
    }

    if (onlyFav) {
      setItems(allItems.filter(i => i.favorite))
    } else {
      setItems(allItems)
    }
  }, [allItems, onlyFav])

  // Scroll xuống đáy khi load lần đầu hoặc đổi filter
  useEffect(() => {
    if (!loading && items.length > 0) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' })
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Thao tác ────────────────────────────────────────────────────

  const handleDelete = async asset => {
    try {
      await deleteMedia(asset.id)
      setLightbox(null)
      setAllItems(prev => prev.filter(i => i.id !== asset.id))
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
      setAllItems(prev => prev.map(i => i.id === asset.id ? { ...i, ...updated } : i))
      onNotify?.('Đã đổi tên')
    } catch (e) {
      onNotify?.(e.message || 'Đổi tên thất bại', false)
    }
  }

  const handleFavorite = async asset => {
    const next = !asset.favorite
    setAllItems(prev => prev.map(i => i.id === asset.id ? { ...i, favorite: next } : i))
    try {
      await favoriteMedia(asset.id, next)
      if (onlyFav && !next) {
        setLightbox(null)
      }
    } catch {
      setAllItems(prev => prev.map(i => i.id === asset.id ? { ...i, favorite: !next } : i))
      onNotify?.('Không cập nhật được', false)
    }
  }

  // ── Chọn nhiều để tải/xóa/album hàng loạt ─────────────────────
  const gridRef = useRef(null)
  const sel = useSweepSelect(gridRef)
  const [askDelete, setAskDelete] = useState(false)
  const [showAlbumPicker, setShowAlbumPicker] = useState(false)
  const [busy, setBusy] = useState(false)

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
      setAllItems(prev => prev.filter(i => !rm.has(i.id)))
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

  const hasFilter = onlyFav || query || fromMs != null || albumId != null
  const groups = groupByDate(items, Date.now(), granularity)

  const showFullSkeleton = loading && items.length === 0

  return (
    <>
      <style>{`
        @keyframes mediaIn {
          from { opacity: 0; transform: scale(.94) translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes mediaOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(.85); }
        }
        @keyframes groupIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
        .media-tile  { animation: mediaIn .26s cubic-bezier(.2,.8,.3,1) both; }
        .media-tile-out { animation: mediaOut .22s ease both; pointer-events: none; }
        .media-group-enter { animation: groupIn .2s ease both; }
        .fav-enter .media-tile { animation: mediaIn .3s cubic-bezier(.2,.8,.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .media-tile, .media-tile-out, .media-group-enter, .fav-enter .media-tile { animation: none; }
        }
      `}</style>

      <div className="pt-3" />

      {showFullSkeleton ? (
        <div className="pt-1"><SkeletonTiles count={20} /></div>
      ) : !loading && items.length === 0 ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">{hasFilter ? '🔍' : '🖼️'}</div>
          <p className="text-sm">{hasFilter ? 'Không có mục nào khớp bộ lọc' : 'Chưa có tài nguyên nào'}</p>
        </div>
      ) : items.length > 0 && (
        <div ref={gridRef}
          className={`select-none ${favAnimating ? 'fav-enter' : ''}`}
          onContextMenu={e => e.preventDefault()}
          style={{
            touchAction: sel.selectMode ? 'none' : 'auto',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
          }}>
        {groups.map(group => (
          <section key={group.key} className="mb-4 media-group-enter">
            <h3 className="py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
              {group.label}
              <span className="ml-2 font-normal text-gray-300 normal-case">{group.items.length}</span>
            </h3>

            <div className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
              {group.items.map((it, idx) => {
                const picked = sel.isSelected(it.id)
                return (
                <div key={it.id} data-select-id={it.id}
                  className={`relative aspect-square overflow-hidden bg-gray-100 rounded-lg group media-tile
                    ${picked ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  style={{ animationDelay: `${Math.min(idx, 12) * 18}ms` }}>

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
        ))}
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
          onAddToAlbum={() => sel.count > 0 && setShowAlbumPicker(true)}
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

      {showAlbumPicker && (
        <AlbumPickerModal
          assetIds={selectedIds()}
          onClose={() => setShowAlbumPicker(false)}
          onDone={() => { setShowAlbumPicker(false); sel.exit() }}
          onNotify={onNotify}
        />
      )}
    </>
  )
}
