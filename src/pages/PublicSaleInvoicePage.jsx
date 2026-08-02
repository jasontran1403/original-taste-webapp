import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicSaleOrder, submitSaleInvoiceInfo } from '../services/api'
import { fmtCurrency, fmtDateTime } from '../utils/format'
import toast from 'react-hot-toast'
import OrderNotFound from '../components/OrderNotFound'

/**
 * Trang công khai (không cần đăng nhập) cho khách mua sỉ/lẻ tự nhập thông tin
 * xuất hóa đơn, mở từ QR in trên hóa đơn của seller.
 *
 * Route: /invoice/sale/:token
 *
 * Khác trang POS: KHÔNG có deadline 6 giờ. Form chỉ bị khóa khi hóa đơn điện tử
 * đã được phát hành — lúc đó thông tin người mua đã có giá trị pháp lý.
 */

const FIELDS = [
  { key: 'taxCode',        label: 'Mã số thuế',            ph: '0100109106',                  type: 'text' },
  { key: 'companyName',    label: 'Tên công ty / Tổ chức', ph: 'Công ty TNHH ABC',            type: 'text' },
  { key: 'companyAddress', label: 'Địa chỉ công ty',       ph: '123 Nguyễn Huệ, Q1, TP.HCM',  type: 'text' },
  { key: 'invoiceEmail',   label: 'Email nhận hóa đơn *',  ph: 'ketoan@congty.vn',            type: 'email' },
  { key: 'contactName',    label: 'Người liên hệ',         ph: 'Nguyễn Văn A',                type: 'text' },
  { key: 'companyPhone',   label: 'Số điện thoại',         ph: '0901234567',                  type: 'tel' },
]

function SectionCard({ icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-50">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold text-gray-800 text-sm tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, accent }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 font-medium shrink-0 mr-4">{label}</span>
      <span className={`text-sm font-semibold text-right ${accent ? 'text-blue-700' : 'text-gray-800'}`}>
        {value || '—'}
      </span>
    </div>
  )
}

export default function PublicSaleInvoicePage() {
  const { token } = useParams()

  const [order, setOrder] = useState(null)
  const [state, setState] = useState('loading')   // loading | ok | error
  const [form, setForm] = useState({
    taxCode: '', companyName: '', companyAddress: '',
    invoiceEmail: '', contactName: '', companyPhone: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)

  const load = async () => {
    try {
      const r = await getPublicSaleOrder(token)
      const d = r.data?.data
      if (!d) { setState('error'); return }
      setOrder(d)
      setForm({
        taxCode:        d.invoiceTaxCode || '',
        companyName:    d.invoiceCompanyName || '',
        companyAddress: d.invoiceAddress || '',
        invoiceEmail:   d.invoiceEmail || '',
        contactName:    d.contactName || d.customerName || '',
        companyPhone:   d.companyPhone || d.customerPhone || '',
      })
      setState('ok')
    } catch {
      setState('error')
    }
  }

  useEffect(() => {
    if (!token) { setState('error'); return }
    load()
  }, [token])   // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErr('') }

  const validate = () => {
    if (!form.invoiceEmail.trim()) return 'Vui lòng nhập email nhận hóa đơn'
    if (!/^\S+@\S+\.\S+$/.test(form.invoiceEmail.trim())) return 'Email không hợp lệ'
    const hasTax = !!form.taxCode.trim()
    const hasCo  = !!form.companyName.trim()
    if (hasTax && !hasCo) return 'Có mã số thuế thì phải nhập tên công ty'
    if (!hasTax && hasCo) return 'Có tên công ty thì phải nhập mã số thuế'
    return ''
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const v = validate()
    if (v) { setErr(v); return }
    setSaving(true); setErr('')
    try {
      const res = await submitSaleInvoiceInfo(token, form)
      const env = res?.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message || 'Gửi thất bại')
      }
      setEditing(false)
      await load()
      toast.success(order?.invoiceSubmitted
        ? 'Cập nhật thông tin hóa đơn thành công'
        : 'Gửi thông tin xuất hóa đơn thành công')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e2) {
      const msg = e2.response?.data?.message || e2.message || 'Có lỗi xảy ra, vui lòng thử lại.'
      setErr(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"
            style={{ borderWidth: '3px' }} />
          <p className="text-gray-400 text-sm">Đang tải đơn hàng...</p>
        </div>
      </div>
    )
  }

  // Không tìm thấy đơn (token sai, đơn đã xóa) → dùng chung màn hình lỗi
  if (state === 'error') {
    return <OrderNotFound message="Mã QR không hợp lệ hoặc đơn hàng đã bị xóa." />
  }

  const locked = !!order.locked
  const isSubmitted = !!order.invoiceSubmitted
  const showForm = !locked && (!isSubmitted || editing)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm bg-white/90">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm">🧾</div>
          <div>
            <p className="text-xs font-bold text-gray-900 leading-none">Xuất hóa đơn</p>
            <p className="text-xs text-gray-400 mt-0.5">
              #{order.orderCode}{order.typeLabel ? ` · ${order.typeLabel}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4 pb-12">

        {/* Đơn hàng */}
        <SectionCard icon="🧾" title="Thông tin đơn hàng">
          <InfoRow label="Mã đơn" value={order.orderCode} />
          <InfoRow label="Thời gian" value={fmtDateTime(order.createdAt)} />
          {order.typeLabel && <InfoRow label="Loại đơn" value={order.typeLabel} />}
          {order.customerName && <InfoRow label="Khách hàng" value={order.customerName} />}
          {order.discountAmount > 0 && (
            <InfoRow label="Chiết khấu" value={`-${fmtCurrency(order.discountAmount)}`} />
          )}
          {order.totalVatAmount > 0 && <InfoRow label="VAT" value={fmtCurrency(order.totalVatAmount)} />}
          <InfoRow label="Tổng thanh toán" value={fmtCurrency(order.finalAmount)} accent />

          {order.items?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Chi tiết hàng</p>
              <div className="space-y-2.5">
                {order.items.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {it.productName}{it.variantName ? ` - ${it.variantName}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        {fmtCurrency(it.unitPrice)} × {it.quantity} {it.unit || ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">{fmtCurrency(it.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Đã phát hành */}
        {locked && (
          <SectionCard icon="📄" title="Hóa đơn điện tử">
            <InfoRow label="Số hóa đơn" value={order.eInvoiceNo} accent />
            {order.eInvoiceIssuedDate && (
              <InfoRow label="Phát hành" value={fmtDateTime(order.eInvoiceIssuedDate)} />
            )}
            <p className="text-xs text-gray-400 mt-3 leading-relaxed">
              Hóa đơn đã được phát hành và gửi tới email của bạn. Thông tin người mua
              không thể thay đổi nữa — cần điều chỉnh, vui lòng liên hệ nhân viên bán hàng.
            </p>
          </SectionCard>
        )}

        {/* Thông tin đã nhập */}
        {isSubmitted && (
          <SectionCard icon="📄" title="Thông tin xuất hóa đơn">
            {order.invoiceTaxCode
              ? (
                <>
                  <InfoRow label="MST" value={order.invoiceTaxCode} />
                  <InfoRow label="Công ty" value={order.invoiceCompanyName} />
                  {order.invoiceAddress && <InfoRow label="Địa chỉ" value={order.invoiceAddress} />}
                </>
              )
              : <p className="text-xs text-gray-400 mb-2">Xuất hóa đơn khách lẻ (không có MST).</p>}
            <InfoRow label="Email" value={order.invoiceEmail} />
            {order.invoiceSubmittedAt && (
              <InfoRow label="Cập nhật" value={fmtDateTime(order.invoiceSubmittedAt)} />
            )}

            {!locked && (
              <button
                type="button"
                onClick={() => setEditing(v => !v)}
                className="mt-4 w-full py-3 border border-blue-200 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition"
              >
                {editing ? 'Đóng chỉnh sửa' : '✏️ Cập nhật thông tin'}
              </button>
            )}
          </SectionCard>
        )}

        {/* Form */}
        {showForm && (
          <SectionCard icon="📝" title={isSubmitted ? 'Cập nhật thông tin' : 'Thông tin xuất hóa đơn'}>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">
              Bỏ trống <b>mã số thuế</b> và <b>tên công ty</b> nếu bạn lấy hóa đơn cá nhân —
              khi đó chỉ cần email. Có thể sửa lại cho tới khi hóa đơn được phát hành.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {FIELDS.map(({ key, label, ph, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    {label}
                  </label>
                  <input
                    type={type}
                    value={form[key]}
                    placeholder={ph}
                    onChange={e => set(key, e.target.value)}
                    className="w-full px-3.5 py-3 text-sm border border-gray-200 rounded-xl outline-none
                      focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white transition-all
                      placeholder:text-gray-300"
                  />
                </div>
              ))}

              {err && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex gap-2">
                  <span className="shrink-0">⚠️</span> {err}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white
                  font-bold rounded-xl transition-colors disabled:opacity-50 text-sm
                  flex items-center justify-center gap-2 mt-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <span>{isSubmitted ? '💾' : '📤'}</span>
                    {isSubmitted ? 'Cập nhật thông tin hóa đơn' : 'Xác nhận xuất hóa đơn'}
                  </>
                )}
              </button>
            </form>
          </SectionCard>
        )}

        <p className="text-center text-xs text-gray-400 pt-2">
          Original Taste · Cần hỗ trợ? Liên hệ nhân viên bán hàng.
        </p>
      </div>
    </div>
  )
}
