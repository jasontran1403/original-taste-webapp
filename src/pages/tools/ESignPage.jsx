import { useState, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import { signPdf } from '../../services/api'

/**
 * Worker của pdf.js PHẢI cùng version với API mà react-pdf đang dùng.
 *
 * Bản trước import worker từ `pdfjs-dist/build/pdf.worker.min.mjs?url` — cách đó
 * lấy pdfjs-dist ở node_modules gốc, trong khi react-pdf lại kèm theo một
 * pdfjs-dist version khác. Lệch version là báo lỗi:
 *   The API version "5.4.296" does not match the Worker version "6.2.108".
 *
 * Lấy URL theo đúng `pdfjs.version` mà react-pdf đang chạy thì không bao giờ
 * lệch nữa, kể cả sau này nâng cấp react-pdf.
 *
 * Đánh đổi: worker tải từ CDN nên máy phải ra được internet.
 * Muốn chạy hoàn toàn offline thì:
 *   1. `npm install pdfjs-dist@<giá trị pdfjs.version>` (hiện là 5.4.296)
 *   2. Thay 1 dòng dưới bằng:
 *        import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
 *        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
 *   Nhớ rằng mỗi lần nâng react-pdf phải pin lại pdfjs-dist cho khớp.
 */
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const SIGNERS = [
  { key: 'blue',   dot: 'bg-blue-600',   ring: 'ring-blue-200',   soft: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-500',   label: 'Người ký 1' },
  { key: 'green',  dot: 'bg-green-600',  ring: 'ring-green-200',  soft: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-500',  label: 'Người ký 2' },
  { key: 'purple', dot: 'bg-purple-600', ring: 'ring-purple-200', soft: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-500', label: 'Người ký 3' },
  { key: 'orange', dot: 'bg-orange-600', ring: 'ring-orange-200', soft: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-500', label: 'Người ký 4' },
]

/**
 * PIN mặc định của USB token, điền sẵn để ký được ngay.
 * Đổi bằng biến môi trường VITE_DEFAULT_TOKEN_PIN nếu token dùng PIN khác;
 * để trống ('') thì ô PIN sẽ rỗng như trước.
 *
 * Lưu ý: PIN nằm trong bundle frontend nên ai xem source cũng thấy. Chấp nhận
 * được vì trang này vốn đã không yêu cầu đăng nhập — PIN không phải lớp bảo mật
 * ở đây, mà chỉ là tiện lợi. Nếu cần PIN thật sự bí mật thì phải bỏ giá trị mặc
 * định và bắt người dùng tự nhập.
 */
const DEFAULT_PIN = import.meta.env.VITE_DEFAULT_TOKEN_PIN ?? '12345678'

const today = () =>
  new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

/* ══════════════════════════════════════════════════════════════════
   Hộp thoại PIN
   ══════════════════════════════════════════════════════════════════ */
function PinDialog({ zonesCount, onConfirm, onCancel }) {
  // Điền sẵn PIN mặc định, vẫn ở dạng password và vẫn sửa/xóa được bình thường
  const [pin, setPin]   = useState(DEFAULT_PIN)
  const [show, setShow] = useState(false)
  const [err, setErr]   = useState('')

  const confirm = () => {
    if (pin.length < 4) { setErr('PIN phải có ít nhất 4 ký tự.'); return }
    onConfirm(pin)
    setPin('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <div className="w-12 h-12 rounded-xl bg-blue-600 mx-auto mb-4 flex items-center justify-center text-xl">
          🔐
        </div>
        <h3 className="text-base font-bold text-gray-900 text-center">Nhập PIN USB Token</h3>
        <p className="text-sm text-gray-500 text-center mt-1.5 leading-relaxed">
          Sắp ký <b className="text-gray-800">{zonesCount} vùng</b> trên file PDF.<br />
          PIN chỉ nằm trong header của request và không được lưu ở đâu cả.
        </p>

        <div className="relative mt-5">
          <input
            type={show ? 'text' : 'password'}
            value={pin}
            autoFocus
            onChange={e => { setPin(e.target.value); setErr('') }}
            onKeyDown={e => e.key === 'Enter' && confirm()}
            placeholder="Nhập PIN token..."
            className={`input pr-20 ${err ? 'border-red-300 bg-red-50' : ''}`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {pin && (
              <button onClick={() => { setPin(''); setErr('') }} title="Xóa"
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-gray-600 text-sm">
                ×
              </button>
            )}
            <button onClick={() => setShow(s => !s)} title={show ? 'Ẩn PIN' : 'Hiện PIN'}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 text-sm">
              {show ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {pin === DEFAULT_PIN && DEFAULT_PIN && (
          <p className="text-xs text-gray-400 mt-2">
            Đang dùng PIN mặc định — xóa đi nếu token của bạn dùng PIN khác.
          </p>
        )}
        {err && <p className="text-xs text-red-600 mt-2">⚠️ {err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Huỷ</button>
          <button onClick={confirm} disabled={!pin}
            className="btn-primary flex-[2] justify-center">Xác nhận ký số</button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Con dấu chữ ký hiển thị trên PDF
   ══════════════════════════════════════════════════════════════════ */
function Stamp({ z, selected, onSelect, onDelete }) {
  const c = SIGNERS[z.signerIdx % SIGNERS.length]
  const fs = ratio => Math.max(7, z.h * ratio)

  return (
    <div
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`absolute rounded-md border ${c.border} ${c.soft} overflow-hidden cursor-pointer
        flex flex-col justify-center px-2 py-1 select-none pointer-events-auto
        ${selected ? `ring-2 ${c.ring}` : ''}`}
      style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
    >
      <div className={`font-serif font-bold leading-tight truncate ${c.text}`}
        style={{ fontSize: fs(0.22) }}>
        {z.signerName}
      </div>
      <div className="font-mono text-gray-500" style={{ fontSize: fs(0.15) }}>{today()}</div>
      <div className="text-gray-400 border-t border-gray-200 mt-0.5 pt-0.5" style={{ fontSize: fs(0.13) }}>
        Ký số điện tử
      </div>
      <span className={`absolute top-0 right-0 text-white text-[8px] font-bold px-1.5 py-0.5 ${c.dot}`}>
        Tr.{z.page + 1}
      </span>
      {selected && (
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold border-2 border-white flex items-center justify-center">
          ×
        </button>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Một trang PDF + lớp vẽ vùng ký
   ══════════════════════════════════════════════════════════════════ */
function PdfPageView({ pageNum, pageCount, zones, activeSigner, onAdd, selected, onSelect, onDelete, width }) {
  const wrapRef = useRef(null)
  const [drawing, setDrawing] = useState(null)
  const c = SIGNERS[activeSigner]

  // Toạ độ % so với khung trang — backend nhận đúng đơn vị này
  const pct = e => {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }

  const down = e => {
    if (e.button !== 0) return
    const p = pct(e)
    setDrawing({ sx: p.x, sy: p.y, x: p.x, y: p.y, w: 0, h: 0 })
    onSelect(null)
    e.preventDefault()
  }

  const move = e => {
    if (!drawing) return
    const p = pct(e)
    setDrawing(d => ({
      ...d,
      x: Math.min(p.x, d.sx), y: Math.min(p.y, d.sy),
      w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy),
    }))
  }

  const up = () => {
    if (drawing && drawing.w > 1.5 && drawing.h > 1) {
      onAdd({
        id: Date.now(), page: pageNum,
        x: drawing.x, y: drawing.y, w: drawing.w, h: drawing.h,
        signerIdx: activeSigner, signerName: SIGNERS[activeSigner].label,
      })
    }
    setDrawing(null)
  }

  return (
    <div className="mb-7 flex flex-col items-center">
      <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">
        Trang {pageNum + 1} / {pageCount}
      </div>
      <div ref={wrapRef}
        onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
        className="relative inline-block cursor-crosshair select-none leading-none rounded shadow-md ring-1 ring-gray-200"
      >
        <Page pageNumber={pageNum + 1} width={width}
          renderAnnotationLayer={false} renderTextLayer={false} />
        <div className="absolute inset-0 pointer-events-none">
          {drawing && drawing.w > 0.3 && (
            <div className={`absolute border-2 border-dashed ${c.border} ${c.soft} rounded`}
              style={{ left: `${drawing.x}%`, top: `${drawing.y}%`, width: `${drawing.w}%`, height: `${drawing.h}%` }} />
          )}
          {zones.filter(z => z.page === pageNum).map(z => (
            <Stamp key={z.id} z={z} selected={selected === z.id}
              onSelect={() => onSelect(z.id)} onDelete={() => onDelete(z.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Khung ngoài
   ══════════════════════════════════════════════════════════════════ */
/**
 * Trang này nằm trong AccountantLayout (đã có Navbar bọc ngoài) nên chỉ dựng
 * phần tiêu đề + chỗ đặt nút hành động, không tự tạo thanh header riêng.
 *
 * fullBleed: trừ chiều cao navbar và phần padding/tiêu đề để khu vực xem PDF
 * cuộn được bên trong khung, thay vì kéo dài cả trang.
 */
function Shell({ title, subtitle, actions, fullBleed, children }) {
  return (
    <div className={fullBleed ? 'flex flex-col h-[calc(100vh-8.5rem)] -mx-4 sm:-mx-6 lg:-mx-8' : ''}>
      <div className={`flex flex-wrap items-center gap-3 mb-4 ${fullBleed ? 'px-4 sm:px-6 lg:px-8' : ''}`}>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Trang chính
   ══════════════════════════════════════════════════════════════════ */
export default function ESignPage() {
  const [file, setFile]         = useState(null)
  const [fileUrl, setFileUrl]   = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [zones, setZones]       = useState([])
  const [activeSigner, setActive] = useState(0)
  const [numSigners, setNumSigners] = useState(2)
  const [selected, setSelected] = useState(null)
  const [zoom, setZoom]         = useState(80)
  const [dragOver, setDragOver] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [showPin, setShowPin]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [signed, setSigned]     = useState(null)   // { blobUrl, filename }
  const [error, setError]       = useState('')
  const [sidebar, setSidebar]   = useState(false)  // panel trái trên mobile

  const fileRef = useRef(null)
  const renderWidth = Math.round(595 * zoom / 100)

  const openFile = f => {
    if (!f) return
    if (f.type !== 'application/pdf') { setError('Vui lòng chọn file PDF'); return }
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    setFile(f); setFileUrl(URL.createObjectURL(f))
    setZones([]); setSelected(null); setPdfError(null); setSigned(null); setError('')
  }

  const reset = () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    if (signed?.blobUrl) URL.revokeObjectURL(signed.blobUrl)
    setFile(null); setFileUrl(null); setZones([]); setNumPages(0)
    setSelected(null); setSigned(null); setError('')
  }

  const submit = async pin => {
    setShowPin(false); setSubmitting(true); setError('')
    try {
      setSigned(await signPdf({ file, zones, pin }))
    } catch (err) {
      // signPdf() đã bóc sẵn message cho trường hợp backend trả HTTP 200 + JSON lỗi.
      // Nhánh dưới xử lý nốt trường hợp axios reject thật (500, mất mạng...).
      let msg = err.message
      const blob = err.response?.data
      if (blob instanceof Blob) {
        try { msg = JSON.parse(await blob.text()).message || msg } catch { /* giữ msg cũ */ }
      }
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Chưa chọn file ── */
  if (!file) return (
    <Shell title="Ký số PDF" subtitle="Đặt vùng ký và ký bằng USB token">
      <div className="max-w-xl mx-auto">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            ⚠️ {error}
          </div>
        )}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); openFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}
          className={`card border-2 border-dashed py-14 px-6 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
        >
          <div className="text-5xl mb-4">📄</div>
          <p className="text-sm text-gray-600">
            <span className="text-blue-600 font-bold">Chọn file PDF</span> hoặc kéo thả vào đây
          </p>
          <p className="text-xs text-gray-400 mt-1.5">Chỉ hỗ trợ PDF · Tối đa 50MB</p>
          <input ref={fileRef} type="file" accept=".pdf" hidden
            onChange={e => openFile(e.target.files[0])} />
        </div>

        <div className="flex flex-wrap gap-2 justify-center mt-5">
          {['🔐 Chuẩn PKCS#11', '👥 Nhiều người ký', '📍 Chọn vị trí ký'].map(t => (
            <span key={t} className="badge bg-white border border-gray-200 text-gray-500 py-1.5">{t}</span>
          ))}
        </div>
      </div>
    </Shell>
  )

  /* ── Đã ký xong ── */
  if (signed) return (
    <Shell title="Ký số PDF" subtitle="Hoàn tất">
      <div className="max-w-md mx-auto card p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-300 mx-auto mb-4 flex items-center justify-center text-2xl">
          ✓
        </div>
        <h2 className="text-lg font-bold text-gray-900">Ký số thành công</h2>
        <p className="text-sm text-gray-500 mt-1.5">
          <b className="text-gray-800">{zones.length} chữ ký</b> đã được nhúng vào file.
        </p>
        <p className="badge bg-emerald-50 text-emerald-700 mt-3 break-all">{signed.filename}</p>

        <div className="flex gap-3 mt-6">
          <button onClick={reset} className="btn-secondary flex-1 justify-center">Ký file khác</button>
          <a href={signed.blobUrl} download={signed.filename}
            className="btn-primary flex-1 justify-center">⬇ Tải file</a>
        </div>
      </div>
    </Shell>
  )

  /* ── Màn hình đặt vùng ký ── */
  return (
    <Shell
      title="Ký số PDF"
      subtitle={file.name}
      fullBleed
      actions={
        <>
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => setZoom(z => Math.max(40, z - 10))} className="px-1.5 text-gray-500">−</button>
            <span className="text-xs font-bold text-gray-600 w-10 text-center">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="px-1.5 text-gray-500">+</button>
          </div>
          <button onClick={() => zones.length && setShowPin(true)}
            disabled={zones.length === 0 || submitting}
            className="btn-primary">
            ✍️ Gửi ký ({zones.length})
          </button>
        </>
      }
    >
      {showPin && (
        <PinDialog zonesCount={zones.length} onConfirm={submit} onCancel={() => setShowPin(false)} />
      )}

      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
          <div className="bg-white rounded-2xl px-9 py-7 text-center shadow-2xl">
            <div className="w-10 h-10 mx-auto mb-4 rounded-full border-[3px] border-blue-100 border-t-blue-600 animate-spin" />
            <p className="font-bold text-gray-900 text-sm">Đang ký số...</p>
            <p className="text-xs text-gray-400 mt-1">Không rút USB token lúc này</p>
          </div>
        </div>
      )}

      {/* Thanh file */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-3 shrink-0 overflow-x-auto">
        <button onClick={reset} className="btn-ghost text-gray-500 shrink-0">← Đổi file</button>
        <span className="badge bg-red-50 text-red-600 shrink-0 max-w-[200px] truncate">📄 {file.name}</span>
        {numPages > 0 && <span className="text-xs text-gray-400 shrink-0">{numPages} trang</span>}
        <button onClick={() => setSidebar(s => !s)}
          className="btn-ghost text-gray-500 lg:hidden ml-auto shrink-0">
          {sidebar ? '✕ Đóng' : '☰ Tuỳ chọn'}
        </button>
        <span className="hidden lg:block ml-auto text-xs text-gray-400 shrink-0">
          Kéo chuột trên trang PDF để vẽ vùng ký
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-600 text-sm px-4 sm:px-6 lg:px-8 py-2.5">
          ⚠️ {error}
        </div>
      )}

      {/* relative để panel trái (mobile) neo theo khung này, không neo theo
          viewport — nhờ vậy dùng chung được cho cả 2 chế độ hiển thị */}
      <div className="relative flex-1 min-h-0 flex overflow-hidden">

        {/* Panel trái */}
        <aside className={`${sidebar ? 'block' : 'hidden'} lg:block w-full lg:w-56 shrink-0
          bg-white border-r border-gray-200 overflow-y-auto absolute lg:static inset-0 lg:inset-auto z-20`}>
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Người ký</span>
              <div className="flex gap-1">
                <button onClick={() => setNumSigners(n => Math.max(1, n - 1))}
                  className="w-5 h-5 rounded bg-gray-100 border border-gray-200 text-gray-500 text-xs">−</button>
                <button onClick={() => setNumSigners(n => Math.min(4, n + 1))}
                  className="w-5 h-5 rounded bg-gray-100 border border-gray-200 text-gray-500 text-xs">+</button>
              </div>
            </div>

            <div className="space-y-1.5">
              {SIGNERS.slice(0, numSigners).map((c, i) => {
                const count = zones.filter(z => z.signerIdx === i).length
                const on = activeSigner === i
                return (
                  <button key={c.key} onClick={() => setActive(i)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm border transition-colors
                      ${on ? `${c.soft} ${c.text} border-current font-bold`
                           : 'border-gray-100 text-gray-500 hover:bg-gray-50'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                    <span className="truncate">{c.label}</span>
                    {count > 0 && (
                      <span className={`ml-auto w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${c.dot}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-100 p-3">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase block mb-2">
              Vùng ký ({zones.length})
            </span>
            {zones.length === 0 ? (
              <p className="text-xs text-gray-300 py-6 text-center leading-relaxed">
                Chưa có vùng ký.<br />Kéo chuột trên trang PDF.
              </p>
            ) : zones.map(z => {
              const c = SIGNERS[z.signerIdx % SIGNERS.length]
              return (
                <div key={z.id}
                  onClick={() => setSelected(z.id === selected ? null : z.id)}
                  className={`px-2.5 py-2 rounded-lg mb-1.5 cursor-pointer border transition-colors
                    ${selected === z.id ? `${c.soft} border-current ${c.text}` : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                      <span className={`w-2 h-2 rounded-full ${c.dot}`} />Trang {z.page + 1}
                    </span>
                    <button onClick={e => { e.stopPropagation(); setZones(v => v.filter(x => x.id !== z.id)) }}
                      className="text-gray-300 hover:text-red-500">×</button>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                    {z.w.toFixed(1)}% × {z.h.toFixed(1)}%
                  </p>
                  <p className={`text-[10px] font-semibold ${c.text}`}>{z.signerName}</p>
                </div>
              )
            })}
          </div>

          <div className="border-t border-gray-100 p-3">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase block mb-2">
              Hướng dẫn
            </span>
            {['Chọn người ký', 'Kéo chuột vẽ vùng ký trên PDF', 'Nhấn vùng ký → × để xóa', 'Nhấn Gửi ký → nhập PIN'].map((t, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="w-4 h-4 shrink-0 rounded-full bg-blue-50 text-blue-600 text-[9px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-xs text-gray-500 leading-relaxed">{t}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Vùng xem PDF */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 sm:p-6">
          {pdfError ? (
            <div className="text-center py-16 text-red-500 text-sm">
              <div className="text-3xl mb-3">⚠️</div>
              Không đọc được file PDF
              <p className="text-xs text-gray-400 mt-2">{pdfError}</p>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={e => setPdfError(e.message)}
              loading={<p className="text-center py-16 text-gray-400 text-sm">Đang tải PDF...</p>}
            >
              {Array.from({ length: numPages }, (_, p) => (
                <PdfPageView
                  key={`${fileUrl}-${p}`}
                  pageNum={p} pageCount={numPages}
                  zones={zones} activeSigner={activeSigner}
                  onAdd={z => setZones(v => [...v, z])}
                  selected={selected} onSelect={setSelected}
                  onDelete={id => { setZones(v => v.filter(x => x.id !== id)); setSelected(null) }}
                  width={renderWidth}
                />
              ))}
            </Document>
          )}
        </div>
      </div>
    </Shell>
  )
}