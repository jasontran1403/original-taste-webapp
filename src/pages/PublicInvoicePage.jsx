import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicOrder, submitInvoiceInfo } from '../services/api'
import { fmtCurrency, fmtDateTime, within6h, fmtTimeLeft } from '../utils/format'
import toast from 'react-hot-toast'

// ─── Countdown hook ────────────────────────────────────────────
function useCountdown(createdAt) {
  const [left, setLeft] = useState('')

  useEffect(() => {
    if (!createdAt) return

    const update = () => {
      const expireAt =
        Number(createdAt) + 6 * 60 * 60 * 1000

      const diff = expireAt - Date.now()

      if (diff <= 0) {
        setLeft('00:00:00')
        return
      }

      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)

      setLeft(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      )
    }

    update()

    const timer = setInterval(update, 1000)

    return () => clearInterval(timer)
  }, [createdAt])

  return left
}

// ─── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    ISSUED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Đã phát hành' },
    DRAFT: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-400', label: 'Nháp' },
    ERROR: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Lỗi' },
  }
  const s = map[status] || { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400', label: status || '—' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.bg} ${s.text} ${s.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

// ─── Section card ────────────────────────────────────────────────
function SectionCard({ icon, title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-50">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold text-gray-800 text-sm tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ─── Row pair ────────────────────────────────────────────────────
function InfoRow({ label, value, accent }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 font-medium shrink-0 mr-4">{label}</span>
      <span className={`text-sm font-semibold text-right ${accent ? 'text-blue-700' : 'text-gray-800'}`}>{value || '—'}</span>
    </div>
  )
}

// ─── States ─────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-3 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" style={{ borderWidth: '3px' }} />
        <p className="text-gray-400 text-sm">Đang tải đơn hàng...</p>
      </div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50/30 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl">🔍</div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">Không tìm thấy đơn hàng</h1>
        <p className="text-gray-400 text-sm leading-relaxed">{message || 'Mã đơn hàng không hợp lệ hoặc đã bị xóa.'}</p>
      </div>
    </div>
  )
}

function ExpiredState({ order }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-amber-50/30 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">⏰</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Hết hạn xuất hóa đơn</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Đơn hàng đã quá <strong>6 giờ</strong> kể từ thời điểm tạo.<br />
            Không thể nhập thông tin xuất hóa đơn nữa.
          </p>
        </div>
        {order && <OrderSummaryCard order={order} />}
        <p className="text-center text-xs text-gray-400 pt-2">Liên hệ nhân viên nếu cần hỗ trợ.</p>
      </div>
    </div>
  )
}

// ─── Order summary ───────────────────────────────────────────────
function OrderSummaryCard({ order }) {
  const srcLabel = s => ({ TAKE_AWAY: 'Mang về', DINE_IN: 'Tại quầy', SHOPEE_FOOD: 'Shopee Food', GRAB_FOOD: 'Grab Food' })[s] || s
  const pmLabel = m => ({ CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản', BANK_TRANSFER: 'Chuyển khoản', MOMO: 'MoMo', VNPAY: 'VNPay', ZALOPAY: 'ZaloPay' })[m] || m
  return (
    <SectionCard icon="🧾" title="Thông tin đơn hàng">
      <InfoRow label="Mã đơn" value={order.orderCode} />
      {order.appOrderCode && <InfoRow label="Mã App" value={order.appOrderCode} />}
      <InfoRow label="Thời gian" value={fmtDateTime(order.createdAt)} />
      <InfoRow label="Loại đơn" value={srcLabel(order.orderSource)} />
      {order.customerName && <InfoRow label="Khách hàng" value={order.customerName} />}
      {order.customerPhone && <InfoRow label="Số điện thoại" value={order.customerPhone} />}
      <InfoRow label="Thanh toán" value={pmLabel(order.paymentMethod)} />
      {order.discountAmount > 0 && <InfoRow label="Giảm giá" value={`-${fmtCurrency(order.discountAmount)}`} />}
      {order.totalVatAmount > 0 && <InfoRow label="VAT (đã gộp)" value={fmtCurrency(order.totalVatAmount)} />}
      <InfoRow label="Tổng thanh toán" value={fmtCurrency(order.finalAmount)} accent />
      {order.items?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Chi tiết món</p>
          <div className="space-y-2.5">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.productName}</p>
                  <p className="text-xs text-gray-400">{fmtCurrency(item.finalUnitPrice)} × {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 shrink-0">{fmtCurrency(item.subtotal)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ─── E-Invoice card ───────────────────────────────────────────────
function EInvoiceCard({ order }) {
  if (!order.eInvoiceNo) return null
  const BASE = import.meta.env.VITE_API_URL || ''
  return (
    <SectionCard icon="📄" title="Hóa đơn điện tử">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400">Số hóa đơn</p>
          <p className="text-base font-bold text-gray-900 mt-0.5">{order.eInvoiceNo}</p>
        </div>
        <StatusBadge status={order.eInvoiceStatus} />
      </div>
      {order.eInvoiceIssuedDate && (
        <p className="text-xs text-gray-400 mb-4">Phát hành: {fmtDateTime(order.eInvoiceIssuedDate)}</p>
      )}
      {order.eInvoiceStatus === 'ISSUED' && (
        <div className="flex gap-2">
          <a href={`${BASE}/api/pos/einvoice/${order.eInvoiceNo}/pdf`} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <span>⬇️</span> Tải PDF
          </a>
          <a href={`${BASE}/api/pos/einvoice/${order.eInvoiceNo}/xml`} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
            XML
          </a>
        </div>
      )}
    </SectionCard>
  )
}

// ─── FormField — ĐỊNH NGHĨA NGOÀI component chính ────────────────
// Quan trọng: nếu định nghĩa bên trong PublicInvoicePage,
// mỗi keystroke tạo lại function mới → React unmount/remount input → mất focus.
const LABELS = {
  taxCode: 'Mã số thuế *',
  companyName: 'Tên công ty / Tổ chức *',
  address: 'Địa chỉ công ty',
  invoiceEmail: 'Email nhận hóa đơn *',
}
const PLACEHOLDERS = {
  taxCode: '0100109106',
  companyName: 'Công ty TNHH ABC',
  address: '123 Nguyễn Huệ, Q1, TP.HCM',
  invoiceEmail: 'ketoan@congty.vn',
}

function FormField({ fieldKey, value, error, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {LABELS[fieldKey]}
      </label>
      <input
        type={fieldKey === 'invoiceEmail' ? 'email' : 'text'}
        value={value}
        placeholder={PLACEHOLDERS[fieldKey]}
        onChange={onChange}
        className={`w-full px-3.5 py-3 text-sm border rounded-xl outline-none transition-all placeholder:text-gray-300
          ${error
            ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100 bg-red-50/30'
            : 'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white'}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────
export default function PublicInvoicePage() {
  const { token } = useParams()

  const [order, setOrder] = useState(null)
  const [pageState, setPageState] = useState('loading')
  const [form, setForm] = useState({ taxCode: '', companyName: '', address: '', invoiceEmail: '' })
  const [submitting, setSub] = useState(false)
  const [submitOk, setSubOk] = useState(false)
  const [formErr, setFormErr] = useState({})
  const [apiErr, setApiErr] = useState('')
  const [editingInvoice, setEditingInvoice] = useState(false)
  const timeLeft = useCountdown(order?.createdAt)

  const formRef = useRef(null)

  useEffect(() => {
    if (
      pageState === 'ok' &&
      order &&
      !order.invoiceSubmitted
    ) {
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        })
      }, 300)
    }
  }, [pageState, order])

  useEffect(() => {
    if (!order?.createdAt) return

    const expireAt =
      Number(order.createdAt) + 6 * 60 * 60 * 1000

    const timeout = expireAt - Date.now()

    if (timeout <= 0) {
      setPageState('expired')
      return
    }

    const t = setTimeout(() => {
      setPageState('expired')
    }, timeout)

    return () => clearTimeout(t)
  }, [order?.createdAt])

  const loadOrder = async () => {
    try {
      const r = await getPublicOrder(token)
      const d = r.data?.data

      if (!d) {
        setPageState('error')
        return
      }

      setOrder(d)

      setForm({
        taxCode: d.invoiceTaxCode || '',
        companyName: d.invoiceCompanyName || '',
        address: d.invoiceAddress || '',
        invoiceEmail: d.invoiceEmail || '',
      })

      if (d.eInvoiceStatus === 'ISSUED') {
        setPageState('invoiced')
        return
      }

      if (!within6h(d.createdAt)) {
        setPageState('expired')
        return
      }

      setPageState('ok')
    } catch {
      setPageState('error')
    }
  }

  useEffect(() => {
    if (!token) { setPageState('error'); return }
    loadOrder()
  }, [token])

  const handleChange = (k, val) => {
    setForm(p => ({ ...p, [k]: val }))
    setFormErr(p => ({ ...p, [k]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.taxCode.trim()) e.taxCode = 'Vui lòng nhập mã số thuế'
    if (!form.companyName.trim()) e.companyName = 'Vui lòng nhập tên công ty'
    if (!form.invoiceEmail.trim()) e.invoiceEmail = 'Vui lòng nhập email'
    else if (!/^\S+@\S+\.\S+$/.test(form.invoiceEmail)) e.invoiceEmail = 'Email không hợp lệ'
    return e
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setFormErr(errs); return }
    setSub(true); setApiErr('')
    try {
      await submitInvoiceInfo(token, form)

      setSubOk(true)

      // đóng form chỉnh sửa
      setEditingInvoice(false)

      // reload dữ liệu
      await loadOrder()

      // toast thành công
      toast.success(
        order?.invoiceSubmitted
          ? 'Cập nhật thông tin hóa đơn thành công'
          : 'Gửi thông tin xuất hóa đơn thành công'
      )

      // scroll lên đầu
      setTimeout(() => {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        })
      }, 200)

    } catch (err) {
      setApiErr(
        err.response?.data?.message ||
        err.message ||
        'Có lỗi xảy ra, vui lòng thử lại.'
      )

      toast.error(
        err.response?.data?.message ||
        'Có lỗi xảy ra'
      )
    } finally { setSub(false) }
  }

  // ── Render states ────────────────────────────────────────────
  if (pageState === 'loading') return <LoadingState />
  if (pageState === 'error') return <ErrorState />
  if (pageState === 'expired') return <ExpiredState order={order} />

  const isSubmitted =
    !!order?.invoiceSubmitted

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm bg-white/90">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm">🧾</div>
            <div>
              <p className="text-xs font-bold text-gray-900 leading-none">Xuất hóa đơn</p>
              <p className="text-xs text-gray-400 mt-0.5">#{order.orderCode}</p>
            </div>
          </div>
          {pageState === 'ok' && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-semibold text-amber-700">Còn {timeLeft}</span>
            </div>
          )}
          {isSubmitted && <StatusBadge status={order.eInvoiceStatus || 'DRAFT'} />}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4 pb-12">

        <OrderSummaryCard order={order} />

        {pageState === 'invoiced' && <EInvoiceCard order={order} />}

        {isSubmitted && (
          <SectionCard
            icon="📄"
            title="Thông tin xuất hóa đơn"
          >
            <div className="space-y-1">
              <InfoRow
                label="MST"
                value={order.invoiceTaxCode}
              />

              <InfoRow
                label="Công ty"
                value={order.invoiceCompanyName}
              />

              {order.invoiceAddress && (
                <InfoRow
                  label="Địa chỉ"
                  value={order.invoiceAddress}
                />
              )}

              <InfoRow
                label="Email"
                value={order.invoiceEmail}
              />

              {order.invoiceSubmittedAt && (
                <InfoRow
                  label="Cập nhật"
                  value={fmtDateTime(
                    order.invoiceSubmittedAt
                  )}
                />
              )}
            </div>

            {pageState === 'ok' && (
              <button
                type="button"
                onClick={() => {
                  const next = !editingInvoice
                  setEditingInvoice(next)

                  if (next) {
                    setTimeout(() => {
                      formRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                      })
                    }, 200)
                  }
                }}
                className="mt-4 w-full py-3 border border-blue-200 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition"
              >
                {editingInvoice
                  ? 'Đóng chỉnh sửa'
                  : '✏️ Cập nhật thông tin'}
              </button>
            )}
          </SectionCard>
        )}

        {pageState === 'ok' &&
          (!isSubmitted || editingInvoice) && (
            <div className="" ref={formRef}>
              <SectionCard
                icon="📝"
                title={
                  isSubmitted
                    ? 'Cập nhật thông tin xuất hóa đơn'
                    : 'Thông tin xuất hóa đơn'
                }
              >
                <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                  Điền đầy đủ thông tin để nhận hóa đơn điện tử qua email.{' '}
                  <strong className="text-amber-600">Chỉ được gửi 1 lần</strong> — kiểm tra kỹ trước khi xác nhận.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {['taxCode', 'companyName', 'address', 'invoiceEmail'].map(k => (
                    <FormField
                      key={k}
                      fieldKey={k}
                      value={form[k]}
                      error={formErr[k]}
                      onChange={e => handleChange(k, e.target.value)}
                    />
                  ))}

                  {apiErr && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex gap-2">
                      <span className="shrink-0">⚠️</span> {apiErr}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2 mt-2"
                  >
                    {submitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Đang gửi...
                      </>
                    ) : (
                      <>
                        <span>
                          {order?.invoiceSubmitted ? '💾' : '📤'}
                        </span>
                        {order?.invoiceSubmitted
                          ? 'Cập nhật thông tin hóa đơn'
                          : 'Xác nhận xuất hóa đơn'}
                      </>
                    )}
                  </button>
                </form>
              </SectionCard>
            </div>
          )
        }

        <p className="text-center text-xs text-gray-400 pt-2">
          Original Taste · Cần hỗ trợ? Liên hệ nhân viên bán hàng.
        </p>
      </div>
    </div>
  )
}