/**
 * Phân trang có cửa sổ trượt — luôn hiện trang đầu/cuối và vài trang quanh
 * trang hiện tại, nên vẫn dùng được khi có hàng trăm trang.
 * page: 0-based.
 */
export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null

  const WINDOW = 2   // số trang hiển thị mỗi bên
  const pages = []
  const push = v => { if (pages[pages.length - 1] !== v) pages.push(v) }

  push(0)
  if (page - WINDOW > 1) push('…l')
  for (let i = Math.max(1, page - WINDOW); i <= Math.min(totalPages - 2, page + WINDOW); i++) push(i)
  if (page + WINDOW < totalPages - 2) push('…r')
  if (totalPages > 1) push(totalPages - 1)

  const navCls = 'w-9 h-9 rounded-lg border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors text-sm'

  return (
    <div className="flex justify-center items-center gap-2 mt-5 flex-wrap">
      <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} className={navCls}>
        ‹
      </button>

      {pages.map(p =>
        typeof p === 'string' ? (
          <span key={p} className="w-6 text-center text-gray-400 text-sm select-none">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)}
            className={`w-9 h-9 rounded-lg text-sm font-medium border transition-colors
              ${page === p
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            {p + 1}
          </button>
        )
      )}

      <button onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1} className={navCls}>
        ›
      </button>
    </div>
  )
}
