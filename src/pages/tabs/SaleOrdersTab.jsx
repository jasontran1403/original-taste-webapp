import { useState, useEffect, useCallback, useRef } from 'react'
import DateRangePicker from '../../components/DateRangePicker'
import InvoiceDetailBadge from '../../components/InvoiceDetailBadge'
import Pagination from '../../components/Pagination'
import InvoiceModal from '../../components/InvoiceModal'
import InvoiceInfoModal from '../../components/InvoiceInfoModal'
import { getSaleInvoiceOrders, getSaleOrderTypes, getInvoicePdf } from '../../services/api'
import { fmtCurrency, fmtDateTime, todayVN } from '../../utils/format'

const PAGE_SIZE = 50

const STATUS = {
  PENDING:    { l: 'Chờ xác nhận', cls: 'bg-yellow-100 text-yellow-700' },
  CONFIRMED:  { l: 'Đã xác nhận',  cls: 'bg-blue-100 text-blue-700' },
  PREPARING:  { l: 'Đang chuẩn bị', cls: 'bg-blue-100 text-blue-700' },
  READY:      { l: 'Sẵn sàng',     cls: 'bg-indigo-100 text-indigo-700' },
  DELIVERING: { l: 'Đang giao',    cls: 'bg-indigo-100 text-indigo-700' },
  COMPLETED:  { l: 'Hoàn thành',   cls: 'bg-green-100 text-green-700' },
  CANCELLED:  { l: 'Đã hủy',       cls: 'bg-red-100 text-red-600' },
  FAILED:     { l: 'Thất bại',     cls: 'bg-red-100 text-red-600' },
}

/** WHOLESALE → Sỉ, RETAIL → Lẻ. BE cũng trả sẵn typeLabel, đây là fallback. */
const TYPE_LABEL = { WHOLESALE: 'Sỉ', RETAIL: 'Lẻ', SI: 'Sỉ', LE: 'Lẻ' }
const typeLabel = t => (t ? (TYPE_LABEL[String(t).toUpperCase()] || t) : '')

/**
 * Đơn coi như đã phát hành khi có eInvoiceNo — kể cả eInvoiceStatus bị thiếu
 * (đơn cũ, hoặc lưu kết quả lỗi giữa chừng). Tránh cho phát hành trùng.
 */
const isIssued = o => o.eInvoiceStatus === 'ISSUED' || !!o.eInvoiceNo

function rowCls(o) {
  if (isIssued(o)) return 'bg-emerald-50'
  if (o.invoiceSubmitted) return 'bg-orange-50'
  return ''
}

/**
 * Tab "Bán sỉ/lẻ" — lấy đơn từ bảng `order` để phát hành hóa đơn điện tử.
 * State (ngày, loại đơn, từ khóa, trang) đồng bộ lên URL:
 *   ?tab=sale&salePage=7&saleType=SI
 */
export default function SaleOrdersTab({ pageState, showToast }) {
  const { get, getNum, patch } = pageState
  const today = todayVN()

  const fromDate = get('saleFrom', today)
  const toDate   = get('saleTo', today)
  const page     = getNum('salePage', 0)
  const type     = get('saleType', '')
  const q        = get('saleQ', '')

  const [orders, setOrders] = useState([])
  const [meta, setMeta] = useState({ total: 0, pages: 0 })
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [infoModal, setInfoModal] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Ô tìm kiếm giữ state riêng để gõ mượt, debounce rồi mới đẩy lên URL
  const [search, setSearch] = useState(q)
  const searchTimer = useRef()

  useEffect(() => { setSearch(q) }, [q])

  useEffect(() => {
    getSaleOrderTypes()
      .then(r => setTypes((r.data?.data || []).filter(t => t && t.value)))
      .catch(() => setTypes([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getSaleInvoiceOrders(page, PAGE_SIZE, fromDate, toDate, type || undefined, q || undefined)
      const d = r.data?.data
      setOrders(d?.content || [])
      setMeta({ total: d?.totalElements || 0, pages: d?.totalPages || 0 })
    } catch (e) {
      showToast('Lỗi tải dữ liệu: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, page, type, q, refreshKey])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleRangeChange = (f, t) => patch({ saleFrom: f, saleTo: t, salePage: 0 })
  const handleTypeChange  = e => patch({ saleType: e.target.value, salePage: 0 })

  const handleSearchChange = e => {
    const v = e.target.value
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => patch({ saleQ: v, salePage: 0 }), 400)
  }
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  return (
    <>
      {/* ── Thanh filter ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Đơn bán sỉ / lẻ</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} đơn · {type ? typeLabel(type) : 'Tất cả loại'} · {fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={search}
            onChange={handleSearchChange}
            placeholder="🔍 Mã đơn, tên KH, SĐT, MST..."
            className="px-3 py-2 w-56 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 transition-colors shadow-sm placeholder:text-gray-400"
          />

          {types.length > 0 && (
            <select
              value={type}
              onChange={handleTypeChange}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 transition-colors shadow-sm outline-none focus:border-blue-500"
            >
              <option value="">Tất cả loại đơn</option>
              {types.map(t => <option key={t.value} value={t.value}>{t.label || typeLabel(t.value)}</option>)}
            </select>
          )}

          <DateRangePicker fromDate={fromDate} toDate={toDate} onChange={handleRangeChange} />

          <button onClick={() => setRefreshKey(k => k + 1)} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Làm mới
          </button>
        </div>
      </div>

      {/* ── Chú thích màu ── */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
        {[
          { cls: 'bg-emerald-100 border-emerald-300', lbl: 'Đã xuất hóa đơn' },
          { cls: 'bg-orange-100 border-orange-300',   lbl: 'Có MST — xuất HĐ công ty' },
          { cls: 'bg-white border-gray-200',          lbl: 'Khách lẻ / chưa có MST' },
        ].map(({ cls, lbl }) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded border ${cls} shrink-0`} />
            {lbl}
          </div>
        ))}
      </div>

      {/* ── Bảng ── */}
      <div className="card">
        {loading ? (
          <div className="py-20 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">⏳</div>
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p className="font-medium">Không có đơn bán sỉ/lẻ nào</p>
            <p className="text-sm mt-1 text-gray-300">Thử đổi bộ lọc hoặc khoảng thời gian</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Mã đơn / Loại', 'Khách hàng', 'Thông tin HĐ', 'Tiền hàng', 'VAT',
                    'Thành tiền', 'Thời gian tạo', 'Hành động'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(o => (
                  <tr key={o.id} className={`transition-colors hover:brightness-95 ${rowCls(o)}`}>
                    <td className="px-4 py-3 min-w-[140px]">
                      <p className="font-semibold text-gray-900">{o.orderCode}</p>
                      {o.type && <p className="text-xs text-blue-600 mt-0.5">📦 {o.typeLabel || typeLabel(o.type)}</p>}
                      <span className={`badge text-xs mt-1 ${STATUS[o.status]?.cls || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS[o.status]?.l || o.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 min-w-[150px]">
                      <p className="text-gray-800 font-medium">
                        {o.customerName || <span className="text-gray-300 italic">Khách lẻ</span>}
                      </p>
                      {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}
                      {o.invoiceDetail?.companyName && (
                        <p className="text-xs text-gray-500 mt-0.5">🏢 {o.invoiceDetail.companyName}</p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <InvoiceDetailBadge o={o} />
                        <button onClick={() => setInfoModal(o)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
                          {isIssued(o)
                            ? '👁 Xem thông tin / QR'
                            : (o.invoiceSubmitted ? '✏️ Sửa thông tin / QR' : '➕ Nhập thông tin / QR')}
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-800">{fmtCurrency(o.totalAmount)}</p>
                      {o.discountAmount > 0 && (
                        <p className="text-xs text-red-500">
                          - {fmtCurrency(o.discountAmount)}
                          {o.discountRate > 0 && ` (${o.discountRate}%)`}
                        </p>
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
                        {/* Đã phát hành → chỉ còn xem hóa đơn, không cho xem trước / phát hành lại */}
                        {isIssued(o) ? (
                          <>
                            <button
                              onClick={async () => {
                                if (!o.eInvoiceNo) { showToast('❌ Đơn chưa có số hóa đơn', false); return }
                                try {
                                  const url = await getInvoicePdf(o.eInvoiceNo)
                                  window.open(url, '_blank')
                                } catch { showToast('❌ Không lấy được PDF', false) }
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 text-left">
                              📄 Xem hóa đơn
                              {o.eInvoiceNo && <span className="text-emerald-500 font-mono">{o.eInvoiceNo}</span>}
                            </button>
                            <button onClick={() => setModal({ ...o, _cqtMode: true })}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-left">
                              📨 Gửi CQT
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setModal(o)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-left">
                              👁 Xem trước HĐ
                            </button>
                            {o.status === 'COMPLETED' && (
                              <button onClick={() => setModal(o)}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-left">
                                🧾 Phát hành HĐ
                              </button>
                            )}
                          </>
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

      <Pagination page={page} totalPages={meta.pages} onChange={p => patch({ salePage: p })} />

      {infoModal && (
        <InvoiceInfoModal
          order={infoModal}
          onClose={() => setInfoModal(null)}
          onSaved={() => {
            setInfoModal(null)
            showToast('✅ Đã cập nhật thông tin xuất hóa đơn')
            setRefreshKey(k => k + 1)
          }}
        />
      )}

      {modal && (
        <InvoiceModal
          source="sale"
          order={modal}
          onClose={() => setModal(null)}
          onIssued={invoiceNo => {
            setModal(null)
            showToast(`✅ Phát hành OK — ${invoiceNo}`)
            setRefreshKey(k => k + 1)
          }}
        />
      )}
    </>
  )
}
