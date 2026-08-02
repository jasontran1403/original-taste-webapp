import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listMedia, uploadMedia, deleteMedia, renameMedia, favoriteMedia, mediaUrl,
} from '../../services/api'
import MediaLightbox from './MediaLightbox'
import { groupByDate } from './groupByDate'

const PAGE_SIZE = 60

/**
 * Thư viện ảnh/video kiểu gallery điện thoại.
 *
 * • Nhóm theo ngày với tiêu đề dính (sticky) — cuộn tới đâu biết mốc thời gian
 *   tới đó. Độ chi tiết nhãn thay đổi theo tuổi file, xem groupByDate.js.
 * • Thả tim để lọc nhanh, tìm theo tên, lọc theo khoảng ngày tải lên.
 * • Lưới dùng ảnh thu nhỏ do backend sinh sẵn — mở 60 ảnh gốc trên 4G thì rất
 *   tốn dung lượng và chậm.
 */
export default function MediaGallery({ refreshKey, onNotify }) {
  const [items, setItems]       = useState([])
  const [page, setPage]         = useState(0)
  const [totalPages, setTotal]  = useState(0)
  const [totalCount, setCount]  = useState(0)
  const [loading, setLoading]   = useState(false)
  const [uploading, setUp]      = useState(false)
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState(null)

  // Bộ lọc
  const [onlyFav, setOnlyFav] = useState(false)
  const [search, setSearch]   = useState('')
  const [query, setQuery]     = useState('')      // giá trị đã debounce
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState('')
  const [showFilter, setShow] = useState(false)

  const inputRef  = useRef(null)
  const searchRef = useRef(null)

  // Gõ tới đâu gọi API tới đó thì vừa giật vừa tốn request → chờ 400ms
  useEffect(() => {
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => setQuery(search), 400)
    return () => clearTimeout(searchRef.current)
  }, [search])

  const filters = {
    favorite: onlyFav,
    q: query,
    // input date cho ra 'YYYY-MM-DD'; "to" phải tính hết ngày, không thì lọc
    // đúng ngày hôm đó sẽ không ra kết quả nào
    from: from ? new Date(from + 'T00:00:00').getTime() : null,
    to:   to   ? new Date(to   + 'T23:59:59').getTime() : null,
  }

  const load = useCallback(async (targetPage = 0, append = false) => {
    setLoading(true)
    try {
      const res = await listMedia(targetPage, PAGE_SIZE, filters)
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      setItems(prev => append ? [...prev, ...(d.content || [])] : (d.content || []))
      setTotal(d.totalPages || 0)
      setCount(d.totalElements || 0)
      setPage(d.currentPage || 0)
    } catch (e) {
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
    }
  }, [onlyFav, query, from, to, onNotify])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0, false) }, [refreshKey, onlyFav, query, from, to])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Thao tác ────────────────────────────────────────────────────

  const handleUpload = async e => {
    const files = e.target.files
    e.target.value = ''
    if (!files?.length) return

    setUp(true); setProgress(0)
    try {
      const res = await uploadMedia(files, ev => {
        if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100))
      })
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      if (d?.failed?.length) {
        onNotify?.(`${d.failed.length} file không tải được: ${d.failed[0]}`, false)
      } else {
        onNotify?.(env.message || 'Đã tải lên')
      }
      load(0, false)
    } catch (err) {
      onNotify?.(err.message || 'Tải lên thất bại', false)
    } finally {
      setUp(false); setProgress(0)
    }
  }

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
    // Cập nhật lạc quan để bấm tim không bị khựng, hỏng thì trả lại trạng thái cũ
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

  const clearFilters = () => {
    setOnlyFav(false); setSearch(''); setQuery(''); setFrom(''); setTo('')
  }

  const hasFilter = onlyFav || query || from || to
  const groups = groupByDate(items)

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      {/* Thanh hành động */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="btn-primary disabled:opacity-50">
          {uploading ? `Đang tải ${progress}%` : '⬆ Tải lên'}
        </button>
        <input ref={inputRef} type="file" hidden multiple
          accept="image/*,video/*" onChange={handleUpload} />

        <button onClick={() => setOnlyFav(f => !f)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors
            ${onlyFav ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-gray-200 text-gray-500'}`}>
          {onlyFav ? '❤️ Yêu thích' : '🤍 Yêu thích'}
        </button>

        <button onClick={() => setShow(s => !s)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors
            ${showFilter || from || to ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}>
          🗓 Thời gian
        </button>

        <span className="text-sm text-gray-400 ml-auto">{totalCount} mục</span>
      </div>

      {/* Tìm kiếm */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Tìm theo tên file..."
        className="w-full mb-3 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none
          focus:border-blue-400 transition-colors placeholder:text-gray-300"
      />

      {/* Lọc theo ngày tải lên */}
      {showFilter && (
        <div className="card p-3 mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Từ ngày</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Đến ngày</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo('') }} className="btn-secondary text-xs">
              Xóa lọc ngày
            </button>
          )}
        </div>
      )}

      {hasFilter && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span>Đang lọc</span>
          <button onClick={clearFilters} className="text-blue-600 font-semibold hover:underline">
            Bỏ tất cả bộ lọc
          </button>
        </div>
      )}

      {uploading && (
        <div className="h-1 bg-gray-200 rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Lưới theo nhóm ngày */}
      {items.length === 0 && !loading ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">{hasFilter ? '🔍' : '🖼️'}</div>
          <p className="text-sm">{hasFilter ? 'Không có mục nào khớp bộ lọc' : 'Chưa có tài nguyên nào'}</p>
        </div>
      ) : (
        groups.map(group => (
          <section key={group.key} className="mb-5">
            {/* Tiêu đề dính — cuộn tới đâu thấy mốc thời gian tới đó */}
            <h3 className="sticky top-14 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-1.5
              bg-gray-50/95 backdrop-blur text-xs font-bold text-gray-500 uppercase tracking-wider">
              {group.label}
              <span className="ml-2 font-normal text-gray-300 normal-case">{group.items.length}</span>
            </h3>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2 mt-2">
              {group.items.map(it => (
                <div key={it.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
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

                  {/* Thả tim ngay trên lưới, không cần mở xem */}
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

      {loading && <p className="text-center text-gray-400 text-sm py-6">Đang tải...</p>}

      {page < totalPages - 1 && !loading && (
        <div className="text-center mt-5">
          <button onClick={() => load(page + 1, true)} className="btn-secondary">Tải thêm</button>
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
    </>
  )
}
