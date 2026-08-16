import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchWatermarkLogo, watermarkAndSave, listMedia, mediaUrl } from '../../services/api'

/**
 * Gắn watermark lên ảnh hoặc video — TỰ NHẬN DIỆN loại file, không chia 2 tab.
 *
 * Preview khớp tuyệt đối với file xuất ra vì cả frontend và backend dùng chung
 * công thức:
 *     wmW = mediaWidth * scale
 *     wmH = wmW * (logoH / logoW)
 *     tâm watermark tại (x% * mediaWidth, y% * mediaHeight)
 *
 * Canvas là bề mặt hiển thị DUY NHẤT (thẻ <video> bị ẩn, chỉ làm nguồn khung
 * hình) nên toạ độ chuột/chạm không thể lệch so với ảnh đang thấy.
 */

const DEFAULTS = { x: 50, y: 70, scale: 0.28, rotation: 0, opacity: 1 }

/** Trần độ đậm. 1 = như file logo gốc, >1 = vẽ chồng nhiều lượt cho đậm hơn. */
const MAX_OPACITY = 2.5

/**
 * Canvas (và cả ffmpeg) chỉ nhận alpha tối đa 1.0, không có cách nào làm ảnh
 * "đậm hơn chính nó" trong một lượt vẽ. Cách duy nhất là VẼ CHỒNG nhiều lượt:
 * 180% = 1 lượt alpha 1.0 + 1 lượt alpha 0.8.
 * Backend dùng đúng công thức này nên preview khớp với file xuất ra.
 */
const alphaPasses = opacity => {
  const out = []
  let remain = Math.max(0, opacity)
  while (remain > 0.001 && out.length < 4) {
    out.push(Math.min(1, remain))
    remain -= 1
  }
  return out.length ? out : [0]
}

const POSITION_PRESETS = [
  { label: '↖', x: 15, y: 15 }, { label: '↑', x: 50, y: 15 }, { label: '↗', x: 85, y: 15 },
  { label: '←', x: 15, y: 50 }, { label: '•', x: 50, y: 50 }, { label: '→', x: 85, y: 50 },
  { label: '↙', x: 15, y: 85 }, { label: '↓', x: 50, y: 85 }, { label: '↘', x: 85, y: 85 },
]

export default function WatermarkEditor({ onSaved, onNotify }) {
  const [file, setFile]         = useState(null)
  const [kind, setKind]         = useState('image')   // suy ra từ file, không cho chọn tay
  const [previewUrl, setUrl]    = useState(null)
  const [logo, setLogo]         = useState(null)
  const [settings, setSettings] = useState(DEFAULTS)
  const [saving, setSaving]     = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState('')
  const [playing, setPlaying]   = useState(false)
  const [firstFrame, setFirst]  = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent]   = useState(0)

  const canvasRef = useRef(null)
  const videoRef  = useRef(null)
  const imgRef    = useRef(null)
  const rafRef    = useRef(null)
  const inputRef  = useRef(null)
  const dragRef   = useRef(null)

  const isVideo = kind === 'video'

  // ── Tải logo ────────────────────────────────────────────────────
  useEffect(() => {
    let objectUrl
    fetchWatermarkLogo()
      .then(res => {
        objectUrl = URL.createObjectURL(res.data)
        const img = new Image()
        img.onload = () => setLogo(img)
        img.src = objectUrl
      })
      .catch(() => setError('Không tải được logo watermark từ máy chủ'))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null); setUrl(null); imgRef.current = null
    setPlaying(false); setDuration(0); setCurrent(0); setFirst(false); setError('')
  }

  const pickFile = e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return

    // Tự nhận diện: ưu tiên MIME, thiếu thì suy từ đuôi file
    // (một số máy Android trả content-type rỗng cho .mov)
    const byMime = f.type.startsWith('video/') ? 'video'
      : f.type.startsWith('image/') ? 'image' : null
    const byExt = /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(f.name) ? 'video'
      : /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name) ? 'image' : null
    const detected = byMime || byExt

    if (!detected) { setError('Chỉ hỗ trợ file ảnh hoặc video'); return }

    reset()
    setKind(detected)
    setFile(f)
    setUrl(URL.createObjectURL(f))
  }

  // ── Vẽ ──────────────────────────────────────────────────────────
  const drawOverlay = useCallback((ctx, w, h) => {
    if (!logo) return
    const wmW = w * settings.scale
    const wmH = wmW * (logo.height / logo.width)

    ctx.save()
    ctx.translate((settings.x / 100) * w, (settings.y / 100) * h)
    ctx.rotate((settings.rotation * Math.PI) / 180)
    for (const alpha of alphaPasses(settings.opacity)) {
      ctx.globalAlpha = alpha
      ctx.drawImage(logo, -wmW / 2, -wmH / 2, wmW, wmH)
    }
    ctx.restore()
  }, [logo, settings])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !logo) return
    const ctx = canvas.getContext('2d')

    if (!isVideo) {
      const img = imgRef.current
      if (!img) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)
      drawOverlay(ctx, canvas.width, canvas.height)
    } else {
      const v = videoRef.current
      if (!v || !v.videoWidth) return
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      ctx.drawImage(v, 0, 0)
      drawOverlay(ctx, canvas.width, canvas.height)
    }
  }, [isVideo, logo, drawOverlay])

  useEffect(() => {
    if (isVideo || !previewUrl) return
    const img = new Image()
    img.onload = () => { imgRef.current = img; draw() }
    img.src = previewUrl
  }, [isVideo, previewUrl])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!isVideo) return
    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop) }
    if (playing) rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isVideo, playing, draw])

  // ── Kéo watermark ───────────────────────────────────────────────
  const toPct = e => {
    const r = canvasRef.current.getBoundingClientRect()
    const p = e.touches?.[0] ?? e
    return {
      x: ((p.clientX - r.left) / r.width) * 100,
      y: ((p.clientY - r.top) / r.height) * 100,
    }
  }

  /** Hit-test theo PIXEL, không theo % — % trục X và Y không cùng đơn vị */
  const isOnWatermark = pos => {
    const canvas = canvasRef.current
    if (!canvas || !logo) return false
    const wmW = canvas.width * settings.scale
    const wmH = wmW * (logo.height / logo.width)
    const px = (pos.x / 100) * canvas.width
    const py = (pos.y / 100) * canvas.height
    const cx = (settings.x / 100) * canvas.width
    const cy = (settings.y / 100) * canvas.height
    return Math.abs(px - cx) <= wmW / 2 && Math.abs(py - cy) <= wmH / 2
  }

  const onDown = e => {
    const pos = toPct(e)
    if (!isOnWatermark(pos)) return
    e.preventDefault()
    // Giữ con trỏ (chuột/ngón tay) trên canvas: vẫn nhận được pointermove/
    // pointerup ngay cả khi ngón tay trượt ra ngoài canvas — nhờ vậy luôn
    // dọn được dragRef khi thả tay, không bị "kẹt" trạng thái kéo.
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* trình duyệt cũ */ }
    dragRef.current = { offX: settings.x - pos.x, offY: settings.y - pos.y }
  }

  const onMove = e => {
    // Đọc ra biến cục bộ NGAY: setSettings chạy callback bất đồng bộ khi render,
    // nếu tới lúc đó tay đã thả (onUp gán dragRef.current = null) thì đọc
    // dragRef.current.offX sẽ ném TypeError → app trắng màn hình.
    const drag = dragRef.current
    if (!drag) {
      if (canvasRef.current) {
        canvasRef.current.style.cursor = isOnWatermark(toPct(e)) ? 'grab' : 'default'
      }
      return
    }
    e.preventDefault()
    const pos = toPct(e)
    setSettings(s => ({
      ...s,
      x: clamp(pos.x + drag.offX, 0, 100),
      y: clamp(pos.y + drag.offY, 0, 100),
    }))
  }

  const onUp = e => {
    dragRef.current = null
    if (e?.pointerId != null) {
      try { canvasRef.current?.releasePointerCapture?.(e.pointerId) } catch { /* đã tự nhả */ }
    }
    if (canvasRef.current) canvasRef.current.style.cursor = 'default'
  }

  // ── Nạp video ───────────────────────────────────────────────────
  /**
   * Trình duyệt không decode khung hình nào cho tới khi video được phát, nên
   * canvas sẽ trắng cho tới lúc bấm play. Ép bằng cách tua tới 0.05s: thao tác
   * seek buộc decode đúng một khung và bắn sự kiện `seeked`.
   * Tua 0.05s thay vì 0 vì nhiều file có khung đầu đen.
   */
  const handleLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration || 0)
    try {
      v.currentTime = Math.min(0.05, (v.duration || 1) / 2)
    } catch { /* chưa buffer đủ để seek — các sự kiện dưới vẫn xử lý được */ }
  }

  const handleFrameReady = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setFirst(true)
    setCurrent(v.currentTime || 0)
    draw()
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  const seek = t => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = t
    setCurrent(t)
    // `seeked` (→ handleFrameReady) sẽ vẽ khi khung hình mới decode xong
  }

  // ── Lưu vào thư viện ────────────────────────────────────────────
  const save = async () => {
    if (!file) return
    setSaving(true); setError(''); setProgress(0)
    try {
      const res = await watermarkAndSave(file, settings, ev => {
        if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100))
      })
      const env = res.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message || 'Xử lý thất bại')
      }
      onNotify?.('Đã lưu vào Tài nguyên')
      reset()
      onSaved?.(env?.data ?? env)
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Không lưu được file'
      setError(msg)
      onNotify?.(msg, false)
    } finally {
      setSaving(false); setProgress(0)
    }
  }

  // ── Chọn từ thư viện ──────────────────────────────────────────
  const [showMediaPicker, setMediaPicker] = useState(false)

  const pickFromLibrary = async (asset) => {
    setMediaPicker(false)
    // Fetch the file from server as a blob, then create a File from it
    try {
      const url = mediaUrl(asset.url)
      const res = await fetch(url)
      if (!res.ok) throw new Error('Fetch failed')
      const blob = await res.blob()
      const f = new File([blob], asset.originalName || 'file', { type: blob.type || asset.contentType })

      const byMime = f.type.startsWith('video/') ? 'video'
        : f.type.startsWith('image/') ? 'image' : null
      const byExt = /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(f.name) ? 'video'
        : /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.name) ? 'image' : null
      const detected = byMime || byExt || 'image'

      reset()
      setKind(detected)
      setFile(f)
      setUrl(URL.createObjectURL(f))
    } catch (e) {
      setError('Không tải được file từ thư viện: ' + (e.message || ''))
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex gap-2">
          <span className="shrink-0">⚠️</span>{error}
        </div>
      )}

      {!file ? (
        <div className="max-w-2xl mx-auto pt-4 sm:pt-8 space-y-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full card border-2 border-dashed border-gray-200 py-14 text-center hover:border-blue-400 transition-colors"
          >
            <div className="text-4xl mb-3">📁</div>
            <p className="font-semibold text-gray-700 text-sm">Chọn ảnh hoặc video từ máy</p>
            <p className="text-xs text-gray-400 mt-1.5">
              Tự nhận diện loại file · JPG, PNG, MP4, MOV
            </p>
          </button>
          <button
            onClick={() => setMediaPicker(true)}
            className="w-full card border-2 border-dashed border-blue-200 py-8 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
          >
            <div className="text-3xl mb-2">🖼️</div>
            <p className="font-semibold text-blue-700 text-sm">Chọn từ thư viện Hình ảnh</p>
            <p className="text-xs text-gray-400 mt-1">
              Chọn ảnh/video đã tải lên trước đó
            </p>
          </button>
          <input ref={inputRef} type="file" hidden accept="image/*,video/*" onChange={pickFile} />

          {showMediaPicker && (
            <MediaPickerModal onClose={() => setMediaPicker(false)} onPick={pickFromLibrary} />
          )}
        </div>
      ) : (
        <>
          {/* Thanh file + nút lưu — dính trên cùng để trên điện thoại luôn bấm được */}
          <div className="sticky top-0 z-10 -mx-2 sm:-mx-4 lg:-mx-6 px-2 sm:px-4 lg:px-6 py-2.5
            bg-gray-50/95 backdrop-blur border-b border-gray-200 flex items-center gap-2 mb-4">
            <span className="badge bg-white border border-gray-200 text-gray-500 shrink-0">
              {isVideo ? '🎥' : '📷'} {(file.size / 1048576).toFixed(1)} MB
            </span>
            <span className="text-xs text-gray-400 truncate flex-1 hidden sm:block">{file.name}</span>
            <button onClick={reset} className="btn-secondary shrink-0 text-xs">Đổi file</button>
            <button onClick={save} disabled={saving} className="btn-primary shrink-0">
              {saving ? (progress < 100 ? `Đang gửi ${progress}%` : 'Đang xử lý...') : '💾 Lưu'}
            </button>
          </div>

          {/*
            Bố cục FULL WIDTH.

            Bản cũ chia 4 cột đều nhau (lg:grid-cols-4), nên trên màn 27" khung
            xem chỉ chiếm 3/4 rồi lại bị canvas giới hạn max-h-[60vh] bóp nhỏ
            thêm — kết quả là một ô ảnh bé tí nằm lọt thỏm giữa màn hình.

            Giờ dùng cột phụ CỐ ĐỊNH 300–340px, phần còn lại dành hết cho khung
            xem. Màn càng rộng thì ảnh càng lớn thay vì bảng điều khiển phình ra
            — bảng đó chỉ có mấy thanh trượt, rộng thêm cũng vô ích.
          */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]
            xl:grid-cols-[minmax(0,1fr)_340px] gap-4 lg:gap-5 items-start">

            {/* Preview — lên trước trên điện thoại */}
            <section className="order-1 min-w-0">
              <div className="card p-2 sm:p-4 bg-gray-100/70">
                <div className="flex justify-center">
                  <canvas
                    ref={canvasRef}
                    onPointerDown={onDown} onPointerMove={onMove}
                    onPointerUp={onUp} onPointerCancel={onUp}
                    /*
                      Chiều cao tính theo phần còn lại của màn hình thay vì
                      %vh cứng: 44px thanh tab + ~56px thanh tệp + ~120px thanh
                      điều khiển video và chú thích. Nhờ vậy ảnh dọc trên màn
                      hình cao vẫn dùng hết chỗ, mà không đẩy nút bấm xuống dưới
                      mép màn hình.
                    */
                    className="max-w-full w-auto h-auto rounded-lg shadow touch-none bg-white
                      max-h-[46svh] sm:max-h-[calc(100svh-260px)] lg:max-h-[calc(100svh-230px)]"
                  />
                </div>

                {isVideo && (
                  <video
                    ref={videoRef} src={previewUrl} className="hidden"
                    playsInline muted preload="auto"
                    onLoadedMetadata={handleLoadedMetadata}
                    onLoadedData={handleFrameReady}
                    onCanPlay={handleFrameReady}
                    onSeeked={handleFrameReady}
                    onTimeUpdate={() => setCurrent(videoRef.current?.currentTime || 0)}
                    onEnded={() => setPlaying(false)}
                  />
                )}

                {isVideo && !firstFrame && (
                  <p className="mt-3 text-xs text-gray-400 text-center">Đang lấy khung hình đầu tiên...</p>
                )}

                {isVideo && (
                  <div className="mt-3 flex items-center gap-2 sm:gap-3">
                    <button onClick={togglePlay}
                      className="w-9 h-9 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm">
                      {playing ? '❚❚' : '▶'}
                    </button>
                    <input type="range" min={0} max={duration || 0} step={0.05} value={current}
                      onChange={e => seek(+e.target.value)} className="flex-1 accent-blue-600" />
                    <span className="text-xs text-gray-500 tabular-nums shrink-0">
                      {fmtTime(current)}/{fmtTime(duration)}
                    </span>
                  </div>
                )}

                <p className="mt-2 text-xs text-gray-400 text-center">
                  Kéo watermark trên khung hình để đổi vị trí
                </p>
              </div>
            </section>

            {/* Điều chỉnh */}
            {/*
              Trên desktop bảng điều chỉnh được ghim lại: ảnh dọc rất cao thì
              cuộn xuống xem chi tiết vẫn kéo được thanh trượt mà không phải
              cuộn ngược lên.
            */}
            <aside className="order-2 lg:sticky lg:top-[60px]">
              <div className="card p-4 space-y-5">
                <Slider label="Kích thước" value={`${Math.round(settings.scale * 100)}%`}
                  min={0.05} max={0.8} step={0.01} v={settings.scale}
                  onChange={v => setSettings(s => ({ ...s, scale: v }))} />

                <Slider label="Góc xoay" value={`${settings.rotation}°`}
                  min={-180} max={180} step={1} v={settings.rotation}
                  onChange={v => setSettings(s => ({ ...s, rotation: v }))} />

                <Slider label="Độ đậm" value={`${Math.round(settings.opacity * 100)}%`}
                  min={0.05} max={MAX_OPACITY} step={0.01} v={settings.opacity}
                  onChange={v => setSettings(s => ({ ...s, opacity: v }))} />
                {settings.opacity > 1 && (
                  <p className="-mt-3 text-xs text-gray-400 leading-relaxed">
                    Trên 100% là vẽ chồng nhiều lượt cho đậm hơn logo gốc.
                  </p>
                )}

                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Vị trí nhanh</p>
                  <div className="grid grid-cols-3 gap-1.5 max-w-[180px]">
                    {POSITION_PRESETS.map(p => (
                      <button key={p.label}
                        onClick={() => setSettings(s => ({ ...s, x: p.x, y: p.y }))}
                        className="aspect-square rounded-lg border border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors text-sm">
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 tabular-nums">
                    X {settings.x.toFixed(1)}% · Y {settings.y.toFixed(1)}%
                  </p>
                </div>

                <button onClick={() => setSettings(DEFAULTS)}
                  className="btn-secondary w-full justify-center text-xs">
                  ↺ Đặt lại mặc định
                </button>
              </div>
            </aside>
          </div>
        </>
      )}
    </>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function Slider({ label, value, min, max, step, v, onChange }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        <span className="text-xs text-gray-400 tabular-nums">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => onChange(+e.target.value)}
        className="w-full accent-blue-600" />
    </div>
  )
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const fmtTime = s => {
  if (!s || Number.isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
/* ── Modal chọn ảnh/video từ thư viện ─────────────────────────────── */

function MediaPickerModal({ onClose, onPick }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const searchTimer = useRef(null)
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setQuery(search); setPage(0) }, 400)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const filters = {}
    if (query) filters.q = query
    listMedia(page, 30, filters).then(res => {
      if (!alive) return
      const env = res.data
      const d = env?.data ?? env
      const batch = d.content || []
      setItems(prev => page === 0 ? batch : [...prev, ...batch])
      setHasMore((d.currentPage || 0) < (d.totalPages || 0) - 1)
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query, page])

  const fmtSize = b => {
    if (b < 1024) return `${b} B`
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ height: 'min(80svh, 620px)' }}>

        <div className="shrink-0 px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
          <h2 className="font-bold text-gray-900 text-base">Chọn từ thư viện</h2>
          <button onClick={onClose}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 text-xl">
            ×
          </button>
        </div>

        <div className="shrink-0 px-5 py-3 border-b border-gray-100">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên file..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-1.5">
          {items.map(it => (
            <button key={it.id} onClick={() => onPick(it)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-100
                bg-gray-50/60 hover:bg-blue-50 hover:border-blue-200 transition-colors text-left">
              <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-200">
                <img src={mediaUrl(it.thumbUrl)} alt="" className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{it.originalName}</p>
                <p className="text-xs text-gray-400">
                  {it.mediaType === 'VIDEO' ? '🎬 Video' : '📷 Ảnh'} · {fmtSize(it.sizeBytes || 0)}
                </p>
              </div>
            </button>
          ))}

          {loading && <p className="text-xs text-gray-300 text-center py-4">Đang tải...</p>}
          {!loading && items.length === 0 && <p className="text-xs text-gray-300 text-center py-8">Không tìm thấy</p>}
          {hasMore && !loading && (
            <button onClick={() => setPage(p => p + 1)}
              className="w-full py-2 text-xs text-blue-600 font-semibold hover:bg-blue-50 rounded-lg">
              Tải thêm...
            </button>
          )}
        </div>
      </div>
    </div>
  )
}