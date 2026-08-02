import { useState, useEffect, useCallback } from 'react'
import DateRangePicker from '../../components/DateRangePicker'
import InvoiceDetailBadge from '../../components/InvoiceDetailBadge'
import Pagination from '../../components/Pagination'
import InvoiceModal from '../../components/InvoiceModal'
import { getInvoiceOrders, getStores, getInvoicePdf } from '../../services/api'
import { fmtCurrency, fmtDateTime, todayVN } from '../../utils/format'

const PAGE_SIZE = 50

const STATUS = {
  COMPLETED:   { l: 'Hoàn thành', cls: 'bg-green-100 text-green-700' },
  CANCELLED:   { l: 'Đã hủy',     cls: 'bg-red-100 text-red-600' },
  PENDING:     { l: 'Chờ',        cls: 'bg-yellow-100 text-yellow-700' },
  IN_PROGRESS: { l: 'Xử lý',      cls: 'bg-blue-100 text-blue-700' },
}

/**
 * Đơn coi như đã phát hành khi có eInvoiceNo — kể cả eInvoiceStatus bị thiếu
 * (đơn cũ, hoặc lưu kết quả lỗi giữa chừng). Tránh cho phát hành trùng.
 */
const isIssued = o => o.eInvoiceStatus === 'ISSUED' || !!o.eInvoiceNo

function rowCls(o) {
  if (isIssued(o)) return 'bg-emerald-50'
  if (o.invoiceSubmitted) return 'bg-orange-50'
  if (o.invoiceDeadlineExpired) return 'bg-yellow-50'
  return ''
}

/**
 * Tab POS. Toàn bộ filter (ngày, cửa hàng, trang) nằm trên URL qua pageState
 * nên F5 vẫn giữ nguyên: ?tab=pos&posStore=2&posPage=3
 */
export default function PosOrdersTab({ pageState, showToast }) {
  const { get, getNum, patch } = pageState
  const today = todayVN()

  // ── State đọc từ URL ────────────────────────────────────────────
  const fromDate = get('posFrom', today)
  const toDate   = get('posTo', today)
  const page     = getNum('posPage', 0)
  const storeId  = get('posStore', '')          // '' = tất cả cửa hàng

  // ── State cục bộ ────────────────────────────────────────────────
  const [orders, setOrders] = useState([])
  const [meta, setMeta] = useState({ total: 0, pages: 0 })
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // ── Danh sách cửa hàng cho dropdown ─────────────────────────────
  useEffect(() => {
    getStores()
      .then(r => setStores(r.data?.data || []))
      .catch(() => setStores([]))   // lỗi dropdown không nên chặn cả trang
  }, [])

  // ── Tải đơn ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getInvoiceOrders(null, page, PAGE_SIZE, fromDate, toDate, storeId || undefined)
      const d = r.data?.data
      setOrders(d?.content || [])
      setMeta({ total: d?.totalElements || 0, pages: d?.totalPages || 0 })
    } catch (e) {
      showToast('Lỗi tải dữ liệu: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, page, storeId, refreshKey])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Đổi filter → luôn về trang 0 (gộp trong 1 patch để không ghi đè nhau)
  const handleRangeChange = (f, t) => patch({ posFrom: f, posTo: t, posPage: 0 })
  const handleStoreChange = e => patch({ posStore: e.target.value, posPage: 0 })

  const storeLabel = storeId
    ? (stores.find(s => String(s.id) === String(storeId))?.name || `#${storeId}`)
    : 'Tất cả cửa hàng'

  return (
    <>
      {/* ── Thanh filter ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Đơn hàng POS</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} đơn · {storeLabel} · {fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={storeId}
            onChange={handleStoreChange}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 transition-colors shadow-sm outline-none focus:border-blue-500"
          >
            <option value="">🏪 Tất cả cửa hàng</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

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
          { cls: 'bg-orange-100 border-orange-300',   lbl: 'Có thông tin xuất HĐ' },
          { cls: 'bg-yellow-100 border-yellow-300',   lbl: 'Hết hạn nhập (12h)' },
          { cls: 'bg-white border-gray-200',          lbl: 'Bình thường' },
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
            <p className="font-medium">Không có đơn hàng nào</p>
            <p className="text-sm mt-1 text-gray-300">Thử chọn cửa hàng hoặc khoảng thời gian khác</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Mã đơn / Cửa hàng', 'Khách hàng', 'Thông tin HĐ', 'Tiền hàng', 'VAT',
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
                      {o.storeName && <p className="text-xs text-blue-600 mt-0.5">🏪 {o.storeName}</p>}
                      {o.appOrderCode && <p className="text-xs text-gray-400">{o.appOrderCode}</p>}
                      <span className={`badge text-xs mt-1 ${STATUS[o.status]?.cls || 'bg-gray-100 text-gray-500'}`}>
                        {STATUS[o.status]?.l || o.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 min-w-[130px]">
                      <p className="text-gray-800 font-medium">
                        {o.customerName || <span className="text-gray-300 italic">Khách lẻ</span>}
                      </p>
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

      <Pagination page={page} totalPages={meta.pages} onChange={p => patch({ posPage: p })} />

      {modal && (
        <InvoiceModal
          source="pos"
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
