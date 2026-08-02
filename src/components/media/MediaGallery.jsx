import { useState, useEffect, useCallback, useRef } from 'react'
import { listMedia, uploadMedia, deleteMedia, mediaUrl } from '../../services/api'
import MediaLightbox from './MediaLightbox'

const PAGE_SIZE = 40

/**
 * Lưới tài nguyên kiểu gallery điện thoại: ảnh và video xếp chung, mới nhất
 * lên trước. Bấm vào mở xem toàn màn hình.
 *
 * Lưới dùng ảnh thu nhỏ do backend sinh sẵn — mở 40 ảnh gốc trên 4G thì rất tốn
 * dung lượng và chậm.
 */
export default function MediaGallery({ refreshKey, onNotify }) {
  const [items, setItems]       = useState([])
  const [page, setPage]         = useState(0)
  const [totalPages, setTotal]  = useState(0)
  const [loading, setLoading]   = useState(false)
  const [uploading, setUp]      = useState(false)
  const [progress, setProgress] = useState(0)
  const [lightbox, setLightbox] = useState(null)   // index đang xem
  const inputRef = useRef(null)

  const load = useCallback(async (targetPage = 0, append = false) => {
    setLoading(true)
    try {
      const res = await listMedia(targetPage, PAGE_SIZE)
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message)
      }
      const d = env?.data ?? env
      setItems(prev => append ? [...prev, ...(d.content || [])] : (d.content || []))
      setTotal(d.totalPages || 0)
      setPage(d.currentPage || 0)
    } catch (e) {
      onNotify?.(e.message || 'Không tải được thư viện', false)
    } finally {
      setLoading(false)
    }
  }, [onNotify])

  useEffect(() => { load(0, false) }, [refreshKey])   // eslint-disable-line react-hooks/exhaustive-deps

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
        onNotify?.(`Có ${d.failed.length} file không tải được: ${d.failed[0]}`, false)
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
      onNotify?.('Đã xóa')
    } catch {
      onNotify?.('Xóa thất bại', false)
    }
  }

  return (
    <>
      {/* Thanh hành động */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="btn-primary disabled:opacity-50">
          {uploading ? `Đang tải ${progress}%` : '⬆ Tải ảnh / video lên'}
        </button>
        <input ref={inputRef} type="file" hidden multiple
          accept="image/*,video/*" onChange={handleUpload} />

        <span className="text-sm text-gray-400 ml-auto">{items.length} mục</span>
      </div>

      {uploading && (
        <div className="h-1 bg-gray-200 rounded-full mb-4 overflow-hidden">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Lưới */}
      {items.length === 0 && !loading ? (
        <div className="py-20 text-center text-gray-300">
          <div className="text-5xl mb-3">🖼️</div>
          <p className="text-sm">Chưa có tài nguyên nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2">
          {items.map((it, i) => (
            <button key={it.id} onClick={() => setLightbox(i)}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
              <img
                src={mediaUrl(it.thumbUrl)}
                alt={it.originalName}
                loading="lazy"
                className="w-full h-full object-cover group-hover:brightness-90 transition"
              />
              {it.mediaType === 'VIDEO' && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-8 h-8 rounded-full bg-black/50 text-white text-xs flex items-center justify-center">
                    ▶
                  </span>
                </span>
              )}
              {it.source === 'WATERMARK' && (
                <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-blue-600/90 text-white text-[9px] font-bold">
                  WM
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-center text-gray-400 text-sm py-6">Đang tải...</p>}

      {page < totalPages - 1 && !loading && (
        <div className="text-center mt-5">
          <button onClick={() => load(page + 1, true)} className="btn-secondary">
            Tải thêm
          </button>
        </div>
      )}

      {lightbox !== null && (
        <MediaLightbox
          items={items}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
