import { useState, useRef, useEffect } from 'react'
import { uploadOneFile, CHUNK_THRESHOLD } from '../../services/api'

/**
 * Hộp thoại chọn và tải file lên.
 *
 * Luồng: chọn file → xem lại danh sách (có thumbnail, đổi ý thì xóa bớt) →
 * bấm Tải lên → theo dõi tiến độ từng file.
 *
 * Tải TUẦN TỰ từng file chứ không song song: gửi 10 video cùng lúc trên mạng
 * di động sẽ tranh băng thông, tất cả cùng chậm và dễ timeout. Tuần tự thì
 * mỗi file xong dứt điểm, hỏng file nào chỉ file đó hỏng.
 */
export default function UploadModal({ onClose, onDone, onNotify }) {
  const [entries, setEntries] = useState([])   // { id, file, preview, status, progress, error }
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  // Thu hồi object URL khi đóng để không rò rỉ bộ nhớ
  useEffect(() => () => {
    entries.forEach(e => { if (e.preview) URL.revokeObjectURL(e.preview) })
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = e => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length) return

    const next = picked.map(file => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      isVideo: file.type.startsWith('video/') || /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(file.name),
      // Ảnh xem trước ngay; video chỉ hiện biểu tượng vì tạo poster ở client
      // phải decode cả file — tốn pin và chậm trên điện thoại
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      status: 'pending',
      progress: 0,
      error: null,
    }))
    setEntries(prev => [...prev, ...next])
  }

  const removeEntry = id => {
    setEntries(prev => {
      const found = prev.find(e => e.id === id)
      if (found?.preview) URL.revokeObjectURL(found.preview)
      return prev.filter(e => e.id !== id)
    })
  }

  const clearAll = () => {
    entries.forEach(e => { if (e.preview) URL.revokeObjectURL(e.preview) })
    setEntries([])
  }

  const patch = (id, data) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))

  const startUpload = async () => {
    const queue = entries.filter(e => e.status !== 'done')
    if (!queue.length) return

    setBusy(true)
    let ok = 0, fail = 0

    for (const entry of queue) {
      patch(entry.id, { status: 'uploading', progress: 0, error: null })
      try {
        await uploadOneFile(entry.file, p => patch(entry.id, { progress: p }))
        patch(entry.id, { status: 'done', progress: 100 })
        ok++
      } catch (err) {
        patch(entry.id, {
          status: 'error',
          error: err.response?.data?.message || err.message || 'Lỗi không xác định',
        })
        fail++
      }
    }

    setBusy(false)
    onNotify?.(
      fail === 0 ? `Đã tải lên ${ok} file` : `${ok} file thành công, ${fail} file lỗi`,
      fail === 0
    )
    if (ok > 0) onDone?.()
    if (fail === 0) onClose?.()
  }

  const pendingCount = entries.filter(e => e.status !== 'done').length
  const totalSize = entries.reduce((sum, e) => sum + e.file.size, 0)

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose?.() }}>

      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ height: 'min(80svh, 620px)' }}>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Tải lên</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {entries.length ? `${entries.length} file · ${fmtSize(totalSize)}` : 'Ảnh và video'}
            </p>
          </div>
          <button onClick={() => !busy && onClose?.()} disabled={busy}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 text-xl disabled:opacity-30">
            ×
          </button>
        </div>

        {/* Danh sách — chiều cao hộp thoại cố định, nhiều file thì cuộn */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-center
              hover:border-blue-400 transition-colors disabled:opacity-40"
          >
            <div className="text-3xl mb-1.5">📁</div>
            <p className="font-semibold text-gray-700 text-sm">Chọn ảnh hoặc video</p>
            <p className="text-xs text-gray-400 mt-1">Chọn được nhiều file cùng lúc</p>
          </button>
          <input ref={inputRef} type="file" hidden multiple
            accept="image/*,video/*" onChange={addFiles} />

          {entries.map(entry => (
            <div key={entry.id}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 bg-gray-50/60">

              <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
                {entry.preview
                  ? <img src={entry.preview} alt="" className="w-full h-full object-cover" />
                  : <span className="text-lg">{entry.isVideo ? '🎬' : '📄'}</span>}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{entry.file.name}</p>
                <p className="text-xs text-gray-400">
                  {fmtSize(entry.file.size)}
                  {entry.file.size > CHUNK_THRESHOLD && ' · chia nhỏ'}
                </p>

                {entry.status === 'uploading' && (
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all duration-200"
                      style={{ width: `${entry.progress}%` }} />
                  </div>
                )}
                {entry.status === 'error' && (
                  <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>
                )}
              </div>

              <div className="shrink-0 w-9 text-center">
                {entry.status === 'uploading' ? (
                  <span className="text-xs font-bold text-blue-600 tabular-nums">{entry.progress}%</span>
                ) : entry.status === 'done' ? (
                  <span className="text-emerald-600">✓</span>
                ) : entry.status === 'error' ? (
                  <span className="text-red-500">⚠️</span>
                ) : (
                  <button onClick={() => removeEntry(entry.id)} disabled={busy}
                    className="w-8 h-8 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30">
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-gray-100 flex items-center gap-3">
          {entries.length > 0 && !busy && (
            <button onClick={clearAll} className="btn-ghost text-gray-400 hover:text-red-500 text-xs">
              Xóa hết
            </button>
          )}
          <button onClick={startUpload} disabled={busy || pendingCount === 0}
            className="btn-primary ml-auto justify-center min-w-[140px]">
            {busy ? 'Đang tải lên...' : `⬆ Tải lên${pendingCount ? ` (${pendingCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const fmtSize = bytes => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
