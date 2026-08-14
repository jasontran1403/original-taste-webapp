/**
 * Thanh thao tác khi đang chọn nhiều mục — ghim đáy màn hình, kính mờ.
 * Dùng chung cho trang Hình ảnh và trang Tệp.
 */
export default function SelectionBar({ count, onDownload, onDelete, onCancel, busy = false }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white/70 backdrop-blur-2xl
      border-t border-white/50 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2">
        <button onClick={onCancel} disabled={busy}
          className="h-10 px-3 rounded-xl text-sm font-semibold text-gray-600 border border-white/60
            bg-white/50 backdrop-blur active:scale-95 transition disabled:opacity-50">
          Hủy
        </button>

        <span className="text-sm font-semibold text-gray-700 px-1">
          Đã chọn {count}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={onDownload} disabled={busy || count === 0}
            className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600/90
              border border-blue-400/50 shadow-lg shadow-blue-500/25 backdrop-blur-md
              flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50">
            <span className="text-base leading-none">⬇</span>
            <span className="hidden xs:inline sm:inline">Tải về</span>
          </button>

          <button onClick={onDelete} disabled={busy || count === 0}
            className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-red-600/90
              border border-red-400/50 shadow-lg shadow-red-500/25 backdrop-blur-md
              flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50">
            <span className="text-base leading-none">🗑</span>
            <span className="hidden xs:inline sm:inline">Xóa</span>
          </button>
        </div>
      </div>
    </div>
  )
}
