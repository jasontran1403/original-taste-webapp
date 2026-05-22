import { useState, useEffect } from 'react'
import { getPublicOrder, submitInvoiceInfo } from '../services/api'
import { fmtCurrency, fmtDateTime, within12h } from '../utils/format'

function ExpiredPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">⏰</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Đã quá thời hạn</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Đơn hàng này đã quá 12 giờ kể từ thời điểm tạo.<br/>
          Không thể nhập thông tin xuất hóa đơn nữa.
        </p>
      </div>
    </div>
  )
}

export default function PublicInvoicePage({ orderCode }) {
  const [order,   setOrder]   = useState(null)
  const [status,  setStatus]  = useState('loading') // loading | ok | expired | error | submitted
  const [form,    setForm]    = useState({ taxCode:'', companyName:'', invoiceEmail:'' })
  const [submitting, setSub]  = useState(false)
  const [submitOk, setSubOk]  = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    if (!orderCode) { setStatus('error'); return }
    getPublicOrder(orderCode).then(r => {
      const d = r.data?.data
      if (!d) { setStatus('error'); return }
      setOrder(d)
      if (d.invoiceSubmitted) { setStatus('submitted'); return }
      // Kiểm tra 12h theo giờ GMT+7 trên client (double-check; server cũng check)
      if (!within12h(d.createdAt)) { setStatus('expired'); return }
      setStatus('ok')
    }).catch(() => setStatus('error'))
  }, [orderCode])

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.taxCode.trim()||!form.companyName.trim()||!form.invoiceEmail.trim()) {
      setErr('Vui lòng điền đầy đủ thông tin'); return
    }
    setSub(true); setErr('')
    try {
      await submitInvoiceInfo(orderCode, form)
      setSubOk(true); setStatus('submitted')
      // Reload order info
      const r = await getPublicOrder(orderCode)
      if (r.data?.data) setOrder(r.data.data)
    } catch(e) {
      setErr(e.response?.data?.message || e.message)
    } finally { setSub(false) }
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <div className="text-5xl mb-3 animate-pulse">⏳</div>
        <p>Đang tải thông tin đơn hàng...</p>
      </div>
    </div>
  )

  if (status === 'expired') return <ExpiredPage />

  if (status === 'error' || !order) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-red-700 mb-2">Không tìm thấy đơn hàng</h1>
        <p className="text-gray-500 text-sm">Mã đơn hàng không hợp lệ hoặc đã bị xóa.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg mb-4 text-2xl">🧾</div>
          <h1 className="text-xl font-bold text-gray-900">Yêu cầu xuất hóa đơn</h1>
          <p className="text-gray-500 text-sm mt-1">Đơn hàng #{order.orderCode}</p>
        </div>

        {/* Order info */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>📋</span> Thông tin đơn hàng
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              ['Mã đơn',      order.orderCode],
              ['Thời gian',   fmtDateTime(order.createdAt)],
              ['Khách hàng',  order.customerName||'—'],
              ['Số điện thoại',order.customerPhone||'—'],
              ['Thanh toán',  order.paymentMethod||'—'],
              ['Tổng tiền',   fmtCurrency(order.finalAmount)],
            ].map(([l,v])=>(
              <div key={l}>
                <p className="text-xs text-gray-400 font-medium">{l}</p>
                <p className="text-sm text-gray-900 font-semibold mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          {/* Items */}
          {order.items?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Chi tiết sản phẩm</p>
              <div className="space-y-2">
                {order.items.map((item,i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.productName}</p>
                      <p className="text-xs text-gray-400">{fmtCurrency(item.finalUnitPrice)} × {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{fmtCurrency(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Submitted state */}
        {status === 'submitted' && (
          <div className="card p-5 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-amber-900">
                  {submitOk ? 'Gửi thông tin thành công!' : 'Thông tin đã được gửi trước đó'}
                </p>
                <div className="mt-3 space-y-1 text-sm text-amber-800">
                  <p><span className="font-medium">MST:</span> {order.invoiceTaxCode}</p>
                  <p><span className="font-medium">Công ty:</span> {order.invoiceCompanyName}</p>
                  <p><span className="font-medium">Email:</span> {order.invoiceEmail}</p>
                </div>
                {order.invoiceSubmittedAt && (
                  <p className="text-xs text-amber-600 mt-2">Gửi lúc: {fmtDateTime(order.invoiceSubmittedAt)}</p>
                )}
                <p className="text-xs text-amber-700 mt-3 bg-amber-100 rounded-lg px-3 py-2">
                  Không thể thay đổi thông tin sau khi đã gửi.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        {status === 'ok' && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <span>📝</span> Thông tin xuất hóa đơn
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              Điền thông tin công ty để nhận hóa đơn điện tử qua email. Chỉ được gửi 1 lần.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { k:'taxCode',      lbl:'Mã số thuế *',           type:'text',  ph:'0100109106' },
                { k:'companyName',  lbl:'Tên công ty / Tổ chức *', type:'text',  ph:'Công ty TNHH ABC' },
                { k:'invoiceEmail', lbl:'Email nhận hóa đơn *',   type:'email', ph:'ketoan@congty.vn' },
              ].map(({k,lbl,type,ph})=>(
                <div key={k}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{lbl}</label>
                  <input type={type} value={form[k]} placeholder={ph} required
                    onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}
                    className="input text-base" />
                </div>
              ))}

              {err && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">{err}</div>
              )}

              <button type="submit" disabled={submitting}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 text-base">
                {submitting ? '⏳ Đang gửi...' : '📤 Gửi thông tin xuất hóa đơn'}
              </button>
              <p className="text-xs text-gray-400 text-center">
                ⚠️ Sau khi gửi, bạn không thể thay đổi thông tin.
              </p>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Cần hỗ trợ? Vui lòng liên hệ nhân viên bán hàng.
        </p>
      </div>
    </div>
  )
}
