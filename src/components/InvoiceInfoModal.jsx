import { useState, useEffect } from 'react'
import { updateSaleInvoiceInfo, getSaleInvoiceQr } from '../services/api'

const FIELDS = [
  { key: 'taxCode',        label: 'Mã số thuế',            ph: '0100109106' },
  { key: 'companyName',    label: 'Tên công ty / Tổ chức', ph: 'Công ty TNHH ABC' },
  { key: 'companyAddress', label: 'Địa chỉ công ty',       ph: '123 Nguyễn Huệ, Q1, TP.HCM' },
  { key: 'invoiceEmail',   label: 'Email nhận hóa đơn *',  ph: 'ketoan@congty.vn' },
  { key: 'contactName',    label: 'Người liên hệ',         ph: 'Nguyễn Văn A' },
  { key: 'companyPhone',   label: 'SĐT liên hệ',           ph: '0901234567' },
]

/**
 * Sửa thông tin xuất hóa đơn cho đơn sỉ/lẻ + hiện QR để gửi khách tự nhập.
 *
 * Bỏ trống MST và tên công ty = xuất hóa đơn khách lẻ (chỉ cần email).
 * Nếu điền thì phải điền cả hai — backend cũng validate lại như vậy.
 */
export default function InvoiceInfoModal({ order, onClose, onSaved }) {
  const d = order?.invoiceDetail || {}

  const [form, setForm] = useState({
    taxCode:        d.taxCode || '',
    companyName:    d.companyName || '',
    companyAddress: d.companyAddress || d.address || '',
    invoiceEmail:   d.invoiceEmail || d.email || order?.invoiceEmail || order?.customerEmail || '',
    contactName:    d.contactName || order?.customerName || '',
    companyPhone:   d.companyPhone || order?.customerPhone || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const [qr, setQr] = useState(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const locked = order?.eInvoiceStatus === 'ISSUED' || !!order?.eInvoiceNo

  useEffect(() => {
    setQrLoading(true)
    getSaleInvoiceQr(order.orderCode)
      .then(r => setQr(r.data?.data || null))
      .catch(() => setQr(null))
      .finally(() => setQrLoading(false))
  }, [order.orderCode])

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

  const handleSave = async () => {
    const v = validate()
    if (v) { setErr(v); return }
    setSaving(true); setErr('')
    try {
      const res = await updateSaleInvoiceInfo(order.orderCode, form)
      const env = res?.data
      if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
        throw new Error(env.message || 'Cập nhật thất bại')
      }
      onSaved?.(env?.data)
    } catch (e) {
      setErr(e.response?.data?.message || e.message)
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    if (!qr?.publicUrl) return
    try {
      await navigator.clipboard.writeText(qr.publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* trình duyệt chặn clipboard — khách vẫn copy tay được */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90svh' }}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h2 className="font-bold text-white text-sm sm:text-base">Thông tin xuất hóa đơn</h2>
            <p className="text-blue-200 text-xs mt-0.5">
              Đơn #{order.orderCode}{order.typeLabel ? ` · ${order.typeLabel}` : ''}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl shrink-0">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-5 gap-6">

          {/* Form */}
          <div className="md:col-span-3 space-y-3.5">
            {locked && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
                Đơn đã phát hành hóa đơn <b>{order.eInvoiceNo}</b> — không thể sửa thông tin người mua.
              </div>
            )}

            <p className="text-xs text-gray-400 leading-relaxed">
              Bỏ trống <b>MST</b> và <b>tên công ty</b> nếu xuất hóa đơn cho khách lẻ — khi đó chỉ cần email.
            </p>

            {FIELDS.map(({ key, label, ph }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {label}
                </label>
                <input
                  type={key === 'invoiceEmail' ? 'email' : 'text'}
                  value={form[key]}
                  placeholder={ph}
                  disabled={locked}
                  onChange={e => set(key, e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none
                    focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all
                    placeholder:text-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            ))}

            {err && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex gap-2">
                <span className="shrink-0">⚠️</span> {err}
              </div>
            )}
          </div>

          {/* QR */}
          <div className="md:col-span-2">
            <div className="rounded-xl border border-gray-200 p-4 bg-gray-50/60">
              <p className="text-xs font-semibold text-gray-600 mb-1">📱 Để khách tự nhập</p>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                Mã này cũng được in trên hóa đơn giao cho khách.
              </p>

              {qrLoading ? (
                <div className="h-44 flex items-center justify-center text-gray-300 text-sm">Đang tạo mã...</div>
              ) : qr?.qrImageUrl ? (
                <>
                  <div className="bg-white rounded-lg p-3 flex items-center justify-center border border-gray-100">
                    <img src={qr.qrImageUrl} alt="QR xuất hóa đơn" className="w-40 h-40 object-contain" />
                  </div>
                  <p className="text-[11px] text-gray-400 break-all mt-3 leading-relaxed">{qr.publicUrl}</p>
                  <button onClick={copyLink}
                    className="mt-2 w-full py-2 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                    {copied ? '✓ Đã copy' : '🔗 Copy link'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-400 py-8 text-center">Không tạo được mã QR</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t bg-gray-50 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors">
            Đóng
          </button>
          <button onClick={handleSave} disabled={saving || locked}
            className="flex-1 sm:flex-none sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
              text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            {saving ? 'Đang lưu...' : '💾 Lưu thông tin'}
          </button>
        </div>
      </div>
    </div>
  )
}
