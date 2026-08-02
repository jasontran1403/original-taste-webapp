import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchWatermarkLogo, watermarkAndSave } from '../../services/api'

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
    dragRef.current = { offX: settings.x - pos.x, offY: settings.y - pos.y }
  }

  const onMove = e => {
    if (!dragRef.current) {
      if (canvasRef.current) {
        canvasRef.current.style.cursor = isOnWatermark(toPct(e)) ? 'grab' : 'default'
      }
      return
    }
    e.preventDefault()
    const pos = toPct(e)
    setSettings(s => ({
      ...s,
      x: clamp(pos.x + dragRef.current.offX, 0, 100),
      y: clamp(pos.y + dragRef.current.offY, 0, 100),
    }))
  }

  const onUp = () => {
    dragRef.current = null
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

  // ── Render ──────────────────────────────────────────────────────
  return (
    <>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex gap-2">
          <span className="shrink-0">⚠️</span>{error}
        </div>
      )}

      {!file ? (
        <div className="max-w-md mx-auto">
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full card border-2 border-dashed border-gray-200 py-14 text-center hover:border-blue-400 transition-colors"
          >
            <div className="text-4xl mb-3">📁</div>
            <p className="font-semibold text-gray-700 text-sm">Chọn ảnh hoặc video</p>
            <p className="text-xs text-gray-400 mt-1.5">
              Tự nhận diện loại file · JPG, PNG, MP4, MOV
            </p>
          </button>
          <input ref={inputRef} type="file" hidden accept="image/*,video/*" onChange={pickFile} />
        </div>
      ) : (
        <>
          {/* Thanh file + nút lưu — dính trên cùng để trên điện thoại luôn bấm được */}
          <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5
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

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-5">
            {/* Preview — lên trước trên điện thoại */}
            <section className="lg:col-span-3 order-1">
              <div className="card p-2 sm:p-4 bg-gray-100/70">
                <div className="flex justify-center">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                    onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
                    className="max-w-full max-h-[50vh] sm:max-h-[60vh] w-auto h-auto rounded-lg shadow touch-none bg-white"
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
            <aside className="lg:col-span-1 order-2">
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
