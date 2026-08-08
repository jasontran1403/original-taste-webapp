import { useState, useRef, useEffect, useCallback } from 'react'
import { uploadFile, checkFileName, CHUNK_THRESHOLD } from '../../services/filesApi'
import { splitName, fmtSize, iconOf, badgeClassOf, extOf } from './fileKind'

/**
 * Chọn và tải nhiều tệp lên cùng lúc.
 *
 * Mỗi tệp có ô đặt tên riêng. Bỏ trống thì lấy tên gốc. Tên trùng được máy chủ
 * tự thêm hậu tố (n) — giao diện hỏi trước và hiện cảnh báo NGAY khi gõ xong,
 * chứ không để người dùng chờ hết 200 MB rồi mới biết tên đã bị đổi.
 *
 * SONG SONG 2 TỆP MỘT LÚC: gửi tuần tự thì đường truyền bỏ không trong lúc máy
 * chủ ghi đĩa và tạo thumbnail; gửi hết cùng lúc thì 10 video tranh băng thông,
 * tất cả cùng chậm và dễ timeout. Hai luồng là điểm cân bằng — lấp được khoảng
 * chết mà không làm nghẽn.
 */

const CONCURRENCY = 2
const NAME_CHECK_DELAY = 450

export default function FileUploadModal({ onClose, onDone, onNotify }) {
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const timersRef = useRef({})

  useEffect(() => () => {
    Object.values(timersRef.current).forEach(clearTimeout)
    abortRef.current?.abort()
  }, [])

  // ── Thêm tệp vào hàng đợi ───────────────────────────────────────

  const addFiles = useCallback(files => {
    const picked = Array.from(files || [])
    if (!picked.length) return

    const next = picked.map(file => {
      const { base, ext } = splitName(file.name)
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        ext: ext || extOf(file.name),
        name: base,            // người dùng sửa được
        finalName: null,       // máy chủ chốt lại
        renamed: false,        // true = bị trùng, đã thêm hậu tố
        checking: false,
        status: 'pending',     // pending | uploading | done | error
        progress: 0,
        error: null,
      }
    })
    setEntries(prev => [...prev, ...next])
    next.forEach(e => scheduleNameCheck(e.id, e.name, e.ext))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, data) =>
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))

  /**
   * Hỏi máy chủ xem tên có trùng không.
   *
   * Chờ 450ms sau nhịp gõ cuối: hỏi theo từng ký tự thì vừa giật vừa tốn
   * request, mà kết quả của các ký tự dở dang cũng vô nghĩa.
   */
  const scheduleNameCheck = useCallback((id, name, ext) => {
    clearTimeout(timersRef.current[id])
    timersRef.current[id] = setTimeout(async () => {
      patch(id, { checking: true })
      try {
        const res = await checkFileName(name || '', ext || '')
        patch(id, { finalName: res.finalName, renamed: res.renamed, checking: false })
      } catch {
        // Máy chủ không trả lời được thì thôi, cứ tải lên — bước lưu vẫn sẽ
        // chống trùng, chỉ là không cảnh báo trước được
        patch(id, { checking: false })
      }
    }, NAME_CHECK_DELAY)
  }, [])

  const changeName = (id, value, ext) => {
    patch(id, { name: value, finalName: null, renamed: false })
    scheduleNameCheck(id, value, ext)
  }

  const removeEntry = id => {
    clearTimeout(timersRef.current[id])
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const clearAll = () => {
    Object.values(timersRef.current).forEach(clearTimeout)
    setEntries([])
  }

  // ── Kéo thả ─────────────────────────────────────────────────────

  const onDrop = e => {
    e.preventDefault()
    setDragging(false)
    if (!busy) addFiles(e.dataTransfer.files)
  }

  // ── Tải lên ─────────────────────────────────────────────────────

  const startUpload = async () => {
    const queue = entries.filter(e => e.status === 'pending' || e.status === 'error')
    if (!queue.length) return

    setBusy(true)
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    let ok = 0, fail = 0
    let cursor = 0

    /** Một luồng: lấy tệp kế tiếp trong hàng đợi cho tới khi hết */
    const worker = async () => {
      while (cursor < queue.length) {
        const entry = queue[cursor++]
        patch(entry.id, { status: 'uploading', progress: 0, error: null })

        try {
          const saved = await uploadFile(
            entry.file,
            entry.name?.trim() || '',
            p => patch(entry.id, { progress: p }),
            signal
          )
          patch(entry.id, {
            status: 'done', progress: 100,
            finalName: saved?.originalName || entry.finalName,
            // Tên lúc lưu thật có thể khác lúc kiểm tra, nếu trong lúc chờ có
            // người khác tải lên đúng tên đó
            renamed: saved?.originalName
              && saved.originalName !== `${entry.name}${entry.ext ? '.' + entry.ext : ''}`,
          })
          ok++
        } catch (err) {
          if (signal.aborted) return
          patch(entry.id, {
            status: 'error',
            error: err.response?.data?.message || err.message || 'Lỗi không xác định',
          })
          fail++
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    setBusy(false)
    abortRef.current = null

    if (signal.aborted) return
    onNotify?.(
      fail === 0 ? `Đã tải lên ${ok} tệp` : `${ok} tệp thành công, ${fail} tệp lỗi`,
      fail === 0
    )
    if (ok > 0) onDone?.()
    if (fail === 0) onClose?.()
  }

  const cancelUpload = () => {
    abortRef.current?.abort()
    setBusy(false)
    setEntries(prev => prev.map(e =>
      e.status === 'uploading' ? { ...e, status: 'pending', progress: 0 } : e))
  }

  const pending = entries.filter(e => e.status !== 'done').length
  const totalSize = entries.reduce((sum, e) => sum + e.file.size, 0)
  const anyRenamed = entries.some(e => e.renamed && e.status !== 'done')

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose?.() }}>

      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ height: 'min(88svh, 720px)' }}>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 text-base">Tải tệp lên</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {entries.length ? `${entries.length} tệp · ${fmtSize(totalSize)}` : 'Chọn được nhiều tệp cùng lúc'}
            </p>
          </div>
          <button onClick={() => !busy && onClose?.()} disabled={busy}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg
              hover:bg-gray-100 text-gray-400 text-xl disabled:opacity-30">
            ×
          </button>
        </div>

        {anyRenamed && (
          <div className="shrink-0 px-5 py-2.5 bg-amber-50 border-b border-amber-100
            flex items-start gap-2 text-xs text-amber-800">
            <span className="shrink-0">⚠️</span>
            <span>Có tệp trùng tên với tệp đã lưu. Tên sẽ được thêm hậu tố để không ghi đè lên nhau.</span>
          </div>
        )}

        {/* Danh sách */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2.5 transition-colors
            ${dragging ? 'bg-blue-50/60' : ''}`}>

          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={`w-full border-2 border-dashed rounded-xl py-7 text-center transition-colors
              disabled:opacity-40
              ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-400'}`}>
            <div className="text-3xl mb-1.5">📁</div>
            <p className="font-semibold text-gray-700 text-sm">
              {dragging ? 'Thả để thêm vào danh sách' : 'Chọn tệp hoặc kéo thả vào đây'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Mọi định dạng · tệp lớn tự chia nhỏ khi gửi</p>
          </button>
          <input ref={inputRef} type="file" hidden multiple
            onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

          {entries.map(entry => (
            <EntryRow key={entry.id} entry={entry} busy={busy}
              onChangeName={v => changeName(entry.id, v, entry.ext)}
              onRemove={() => removeEntry(entry.id)} />
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-gray-100 flex items-center gap-3">
          {entries.length > 0 && !busy && (
            <button onClick={clearAll}
              className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors">
              Xoá danh sách
            </button>
          )}
          {busy && (
            <button onClick={cancelUpload}
              className="text-xs font-semibold text-gray-500 hover:text-red-500 transition-colors">
              Huỷ
            </button>
          )}
          <button onClick={startUpload} disabled={busy || pending === 0}
            className="ml-auto h-10 px-5 rounded-xl bg-blue-600 text-white text-sm font-bold
              disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-700
              active:scale-[0.98] transition min-w-[150px]">
            {busy ? 'Đang tải lên...' : `⬆ Tải lên${pending ? ` (${pending})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Một dòng trong danh sách ─────────────────────────────────────── */

function EntryRow({ entry, busy, onChangeName, onRemove }) {
  const asset = { ext: entry.ext, originalName: entry.file.name }
  const chunked = entry.file.size > CHUNK_THRESHOLD

  return (
    <div className={`rounded-xl border p-3 transition-colors
      ${entry.status === 'error' ? 'border-red-200 bg-red-50/50'
        : entry.status === 'done' ? 'border-emerald-200 bg-emerald-50/40'
        : 'border-gray-100 bg-gray-50/60'}`}>

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-white border border-gray-200
          flex items-center justify-center text-lg">
          {iconOf(asset)}
        </div>

        <div className="min-w-0 flex-1">
          {/* Ô đặt tên + đuôi cố định */}
          <div className="flex items-center gap-1.5">
            <input
              value={entry.name}
              onChange={e => onChangeName(e.target.value)}
              disabled={busy || entry.status === 'done'}
              placeholder={entry.file.name}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200
                bg-white text-sm outline-none focus:border-blue-400 transition-colors
                disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300"
            />
            {entry.ext && (
              <span className={`shrink-0 px-1.5 py-1 rounded-md border text-[10px]
                font-bold uppercase ${badgeClassOf(asset)}`}>
                {entry.ext}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-gray-400">
              {fmtSize(entry.file.size)}{chunked && ' · chia nhỏ khi gửi'}
            </span>

            {entry.checking && (
              <span className="text-[11px] text-gray-300">đang kiểm tra tên...</span>
            )}

            {entry.renamed && entry.finalName && (
              <span className="text-[11px] text-amber-700 font-medium">
                Trùng tên → lưu thành <b>{entry.finalName}</b>
              </span>
            )}

            {entry.status === 'error' && (
              <span className="text-[11px] text-red-600 font-medium">{entry.error}</span>
            )}
          </div>

          {entry.status === 'uploading' && (
            <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${entry.progress}%` }} />
            </div>
          )}
        </div>

        <div className="shrink-0 w-10 text-center pt-1.5">
          {entry.status === 'uploading' ? (
            <span className="text-[11px] font-bold text-blue-600 tabular-nums">{entry.progress}%</span>
          ) : entry.status === 'done' ? (
            <span className="text-emerald-600 text-lg">✓</span>
          ) : entry.status === 'error' ? (
            <span className="text-red-500">⚠️</span>
          ) : (
            <button onClick={onRemove} disabled={busy}
              className="w-8 h-8 rounded-lg hover:bg-red-50 text-gray-300
                hover:text-red-500 transition-colors disabled:opacity-30">
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
