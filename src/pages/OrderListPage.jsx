import ReactDOM from 'react-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import Navbar from '../components/Navbar'
import InvoiceModal from '../components/InvoiceModal'
import {
  getInvoiceOrders, getPdfUrl, getInvoicePdf
} from '../services/api'
import { fmtCurrency, fmtDateTime, todayVN } from '../utils/format'

/* ── constants ── */
const STATUS = {
  COMPLETED: { l: 'Hoàn thành', cls: 'bg-green-100 text-green-700' },
  CANCELLED: { l: 'Đã hủy', cls: 'bg-red-100 text-red-600' },
  PENDING: { l: 'Chờ', cls: 'bg-yellow-100 text-yellow-700' },
  IN_PROGRESS: { l: 'Xử lý', cls: 'bg-blue-100 text-blue-700' },
}
const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function rowCls(o) {
  if (o.eInvoiceStatus === 'ISSUED') return 'bg-emerald-50'
  if (o.invoiceSubmitted) return 'bg-orange-50'
  if (o.invoiceDeadlineExpired) return 'bg-yellow-50'
  return ''
}

/* ── DateRangePicker ────────────────────────────────────────────── */
function DateRangePicker({ fromDate, toDate, onChange }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [selecting, setSelecting] = useState(null)
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const parseD = s => s ? new Date(s + 'T00:00:00') : null

  // Fix: dùng getFullYear/getMonth/getDate thay vì toISOString() để tránh lệch UTC
  const toStr = d => {
    if (!d) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
  const firstDOW = (y, m) => new Date(y, m, 1).getDay()

  const isBetween = (d, a, b) => {
    if (!a || !b) return false
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    return d > lo && d < hi
  }

  const clickDay = (d) => {
    const ds = toStr(d)
    if (!selecting) {
      setSelecting(ds)
      onChange(ds, ds)
    } else {
      const [lo, hi] = selecting <= ds ? [selecting, ds] : [ds, selecting]
      onChange(lo, hi)
      setSelecting(null)
      setOpen(false)
    }
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const from = parseD(fromDate)
  const to = parseD(toDate)
  const sel = selecting ? parseD(selecting) : null
  const hov = hovered ? parseD(hovered) : null

  const totalDays = daysInMonth(viewYear, viewMonth)
  const startDOW = firstDOW(viewYear, viewMonth)
  const cells = []
  for (let i = 0; i < startDOW; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(viewYear, viewMonth, d))

  const label = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`

  const dayCls = (d) => {
    if (!d) return ''
    const ds = toStr(d)
    const isFrom = fromDate === ds
    const isTo = toDate === ds
    const isSel = selecting === ds
    const isInRange = !selecting
      ? (from && to && isBetween(d, from, to))
      : (sel && hov && isBetween(d, sel, hov))
    const isHov = hovered === ds

    let cls = 'w-8 h-8 flex items-center justify-center text-xs rounded-full cursor-pointer select-none transition-colors '
    if (isFrom || isTo || isSel)
      cls += 'bg-blue-600 text-white font-semibold '
    else if (isInRange)
      cls += 'bg-blue-100 text-blue-800 rounded-none '
    else if (isHov)
      cls += 'bg-gray-100 '
    else
      cls += 'hover:bg-gray-100 text-gray-700 '
    return cls
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 transition-colors shadow-sm"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="font-medium">{label}</span>
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-11 left-0 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors">
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => (
              <div key={i} className="flex items-center justify-center">
                {d ? (
                  <div
                    className={dayCls(d)}
                    onClick={() => clickDay(d)}
                    onMouseEnter={() => setHovered(toStr(d))}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {d.getDate()}
                  </div>
                ) : <div className="w-8 h-8" />}
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
            {[
              { l: 'Hôm nay', fn: () => { const t = todayVN(); onChange(t, t); setOpen(false) } },
              {
                l: '7 ngày', fn: () => {
                  const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 6)
                  onChange(toStr(f), toStr(t)); setOpen(false)
                }
              },
              {
                l: '30 ngày', fn: () => {
                  const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 29)
                  onChange(toStr(f), toStr(t)); setOpen(false)
                }
              },
              {
                l: 'Tháng này', fn: () => {
                  const t = new Date()
                  const f = new Date(t.getFullYear(), t.getMonth(), 1)
                  onChange(toStr(f), toStr(t)); setOpen(false)
                }
              },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn}
                className="px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                {l}
              </button>
            ))}
          </div>

          {selecting && (
            <p className="mt-2 text-xs text-blue-600 text-center">Chọn ngày kết thúc...</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Invoice detail popover ─────────────────────────────────────── */
// Fix: dùng fixed positioning để thoát khỏi overflow:hidden của card
function InvoiceDetailBadge({ o }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef()

  const updatePosition = () => {
    if (!btnRef.current) return

    const r = btnRef.current.getBoundingClientRect()

    const POPUP_WIDTH = 320
    const POPUP_HEIGHT = 220

    let left = r.left
    let top = r.bottom + 8

    // nếu đụng mép phải
    if (left + POPUP_WIDTH > window.innerWidth) {
      left = window.innerWidth - POPUP_WIDTH - 12
    }

    // nếu không đủ chỗ bên dưới => hiện phía trên
    if (top + POPUP_HEIGHT > window.innerHeight) {
      top = r.top - POPUP_HEIGHT - 8
    }

    setPos({ left, top })
  }

  const handleClick = () => {
    if (!show) {
      updatePosition()
    }
    setShow(v => !v)
  }

  useEffect(() => {
    if (!show) return

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [show])

  if (!o.invoiceSubmitted) {
    return (
      <span className="badge bg-gray-100 text-gray-400 text-xs">
        Chưa có
      </span>
    )
  }

  const d = o.invoiceDetail || {}

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        className="badge bg-amber-100 text-amber-700 cursor-pointer hover:bg-amber-200 transition-colors"
      >
        🏢 Có thông tin
      </button>

      {show &&
        ReactDOM.createPortal(
          <>
            {/* backdrop để click ngoài đóng */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setShow(false)}
            />

            <div
              className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-80 text-sm"
              style={{
                top: pos.top,
                left: pos.left
              }}
            >
              <p className="font-semibold text-gray-800 mb-3">
                Thông tin xuất hóa đơn
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-gray-500">MST:</span>
                  <div className="font-mono font-medium">
                    {d.taxCode}
                  </div>
                </div>

                <div>
                  <span className="text-gray-500">Công ty:</span>
                  <div className="font-medium">
                    {d.companyName}
                  </div>
                </div>

                <div>
                  <span className="text-gray-500">Email:</span>
                  <div className="text-blue-600 break-all">
                    {d.email}
                  </div>
                </div>

                <div>
                  <span className="text-gray-500">Địa chỉ:</span>
                  <div>
                    {d.address}
                  </div>
                </div>

                {d.submittedAt && (
                  <div className="pt-2 border-t text-xs text-gray-400">
                    Gửi lúc: {fmtDateTime(d.submittedAt)}
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function OrderListPage() {
  const today = todayVN()
  const [orders, setOrders] = useState([])
  const [meta, setMeta] = useState({ total: 0, pages: 0 })
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  // Fix: refreshKey để force reload khi bấm "Làm mới"
  const [refreshKey, setRefreshKey] = useState(0)

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getInvoiceOrders(null, page, 50, fromDate, toDate)
      const d = r.data?.data
      setOrders(d?.content || [])
      setMeta({ total: d?.totalElements || 0, pages: d?.totalPages || 0 })
    } catch (e) { showToast('Lỗi tải dữ liệu: ' + e.message, false) }
    finally { setLoading(false) }
  }, [fromDate, toDate, page, refreshKey])

  useEffect(() => { load() }, [load])

  const handleRangeChange = (f, t) => { setFromDate(f); setToDate(t); setPage(0) }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Đơn hàng POS</h1>
            <p className="text-sm text-gray-500 mt-0.5">{meta.total} đơn · {fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}</p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker fromDate={fromDate} toDate={toDate} onChange={handleRangeChange} />
            {/* Fix: dùng setRefreshKey thay vì gọi load() trực tiếp */}
            <button onClick={() => setRefreshKey(k => k + 1)} className="btn-secondary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Làm mới
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
          {[
            { cls: 'bg-emerald-100 border-emerald-300', lbl: 'Đã xuất hóa đơn' },
            { cls: 'bg-orange-100 border-orange-300', lbl: 'Có thông tin xuất HĐ' },
            { cls: 'bg-yellow-100 border-yellow-300', lbl: 'Hết hạn nhập (12h)' },
            { cls: 'bg-white border-gray-200', lbl: 'Bình thường' },
          ].map(({ cls, lbl }) => (
            <div key={lbl} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded border ${cls} shrink-0`} />
              {lbl}
            </div>
          ))}
        </div>

        {/* Fix: bỏ overflow-hidden khỏi card, chỉ giữ overflow-x-auto ở wrapper trong */}
        <div className="card">
          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <div className="text-4xl mb-3 animate-pulse">⏳</div>
              <p>Đang tải dữ liệu...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <div className="text-5xl mb-4">📭</div>
              <p className="font-medium">Không có đơn hàng nào</p>
              <p className="text-sm mt-1 text-gray-300">Thử chọn khoảng thời gian khác</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Mã đơn / Cửa hàng', 'Khách hàng', 'Thông tin HĐ', 'Tiền hàng', 'VAT', 'Thành tiền', 'Thời gian tạo', 'Hành động'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(o => (
                    <tr key={o.id} className={`transition-colors hover:brightness-95 ${rowCls(o)}`}>

                      <td className="px-4 py-3 min-w-[140px]">
                        <p className="font-semibold text-gray-900">{o.orderCode}</p>
                        {o.storeName && <p className="text-xs text-blue-600 mt-0.5">🏪 {o.storeName}</p>}
                        {o.appOrderCode && <p className="text-xs text-gray-400">{o.appOrderCode}</p>}
                        <span className={`badge text-xs mt-1 ${STATUS[o.status]?.cls || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS[o.status]?.l || o.status}
                        </span>
                      </td>

                      <td className="px-4 py-3 min-w-[130px]">
                        <p className="text-gray-800 font-medium">{o.customerName || <span className="text-gray-300 italic">Khách lẻ</span>}</p>
                        {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}
                        {o.orderSource && <p className="text-xs text-gray-400 mt-0.5">{o.orderSource}</p>}
                      </td>

                      <td className="px-4 py-3">
                        <InvoiceDetailBadge o={o} />
                        {o.invoiceDeadlineExpired && !o.eInvoiceStatus && (
                          <p className="text-xs text-amber-600 mt-1">⏰ Hết hạn</p>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-gray-800">{fmtCurrency(o.totalAmount)}</p>
                        {o.discountAmount > 0 && (
                          <p className="text-xs text-red-500">- {fmtCurrency(o.discountAmount)}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-gray-700">{fmtCurrency(o.totalVatAmount)}</p>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-bold text-gray-900">{fmtCurrency(o.finalAmount)}</p>
                        <p className="text-xs text-gray-400">{o.paymentMethod}</p>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-gray-700 text-xs">{fmtDateTime(o.createdAt)}</p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 min-w-[120px]">
                          {!o.eInvoiceStatus && (
                            <button onClick={() => setModal(o)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-left">
                              👁 Xem trước HĐ
                            </button>
                          )}
                          {!o.eInvoiceStatus && o.status === 'COMPLETED' && (
                            <button onClick={() => setModal(o)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-left">
                              🧾 Phát hành HĐ
                            </button>
                          )}
                          {o.eInvoiceStatus === 'ISSUED' && (
                            <button
                              onClick={() => setModal({ ...o, _cqtMode: true })}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-left">
                              📨 Gửi CQT
                            </button>
                          )}
                          {o.eInvoiceStatus === 'ISSUED' && o.eInvoiceNo && (
                            <button
                              onClick={async () => {
                                try {
                                  const url = await getInvoicePdf(o.eInvoiceNo)
                                  window.open(url, '_blank')
                                } catch (e) { showToast('❌ Không lấy được PDF', false) }
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 text-left">
                              📄 Hóa đơn
                              <span className="text-emerald-500 font-mono">{o.eInvoiceNo}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {meta.pages > 1 && (
          <div className="flex justify-center gap-2 mt-5">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="w-9 h-9 rounded-lg border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors text-sm">
              ‹
            </button>
            {Array.from({ length: Math.min(meta.pages, 10) }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                className={`w-9 h-9 rounded-lg text-sm font-medium border transition-colors
                  ${page === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(meta.pages - 1, p + 1))} disabled={page >= meta.pages - 1}
              className="w-9 h-9 rounded-lg border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors text-sm">
              ›
            </button>
          </div>
        )}
      </div>

      {modal && (
        <InvoiceModal
          order={modal}
          onClose={() => setModal(null)}
          onIssued={invoiceNo => {
            setModal(null)
            showToast(`✅ Phát hành OK — ${invoiceNo}`)
            setRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}