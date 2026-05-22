import { useState, useEffect, useRef } from 'react'
import { previewInvoice, issueRetailInvoice, issueBusinessInvoice, sendInvoiceToCqt, getInvoicePdf } from '../services/api'

export default function InvoiceModal({ order, onClose, onIssued }) {
  const initStep = order?._cqtMode ? 'issued' : 'preview'
  const [step, setStep] = useState(initStep)

  const hasInvoiceInfo = !!(order?.invoiceDetail?.taxCode)
  const bizInfo = order?.invoiceDetail || {}

  const [pdfBase64, setPdfBase64]       = useState(null)
  const [issuedResult, setIssuedResult] = useState(
    order?._cqtMode
      ? { invoiceNo: order.eInvoiceNo, invoiceSeries: order.invoiceSeries,
          templateCode: order.templateCode, transactionID: order.eInvoiceTransactionId }
      : null
  )
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const pdfBlobUrl = useRef(null)

  useEffect(() => {
    if (!order?._cqtMode) loadPreview()
    return () => { if (pdfBlobUrl.current) URL.revokeObjectURL(pdfBlobUrl.current) }
  }, [])

  const getBuyerInfo = () => hasInvoiceInfo ? bizInfo : null

  const loadPreview = async () => {
    setLoading(true); setError(null)
    try {
      const r = await previewInvoice(order.orderCode, getBuyerInfo())
      const base64 = r.data?.data || r.data
      setPdfBase64(typeof base64 === 'string' ? base64 : null)
    } catch (e) { console.warn('Preview failed:', e.message) }
    finally { setLoading(false) }
  }

  const handleIssue = async () => {
    setStep('issuing'); setError(null)
    try {
      const res = hasInvoiceInfo
        ? await issueBusinessInvoice(order.orderCode, bizInfo)
        : await issueRetailInvoice(order.orderCode)
      const result = res.data?.data ?? res.data
      if (result?.status === 'ERROR') throw new Error(result.errorMessage)
      setIssuedResult(result)
      setStep('issued')
      onIssued?.(result?.invoiceNo)
    } catch (e) {
      setError(e.response?.data?.message || e.message)
      setStep('error')
    }
  }

  const handleSendCqt = async () => {
    setStep('cqt_sending'); setError(null)
    try {
      await sendInvoiceToCqt(order.orderCode)
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.message || e.message)
      setStep('error')
    }
  }

  const handleOpenPdf = async () => {
    if (!issuedResult?.invoiceNo) return
    try {
      if (pdfBlobUrl.current) URL.revokeObjectURL(pdfBlobUrl.current)
      pdfBlobUrl.current = await getInvoicePdf(issuedResult.invoiceNo)
      window.open(pdfBlobUrl.current, '_blank')
    } catch (e) { setError('Không lấy được PDF: ' + e.message) }
  }

  const fmtVND = v => v != null
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v) : '—'

  // ── Step indicator ──────────────────────────────────────────────
  const STEPS = ['preview', 'issuing', 'issued', 'done']
  const curIdx = STEPS.indexOf(step === 'cqt_sending' ? 'issued' : step)
  const StepDot = ({ s, label }) => {
    const i      = STEPS.indexOf(s)
    const done   = i < curIdx || step === 'done'
    const active = s === step || (s === 'issued' && step === 'cqt_sending')
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
          ${done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-100 text-gray-400'}`}>
          {done ? '✓' : i + 1}
        </div>
        <span className={`text-xs font-medium hidden sm:block
          ${active ? 'text-blue-700' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
          {label}
        </span>
      </div>
    )
  }

  // ── Outer overlay ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>

      {/* Modal — cố định 90svh, flex column */}
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '90svh' }}>

        {/* Header — shrink-0 */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5
          bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h2 className="font-bold text-white text-sm sm:text-base">Phát hành hóa đơn điện tử</h2>
            <p className="text-blue-200 text-xs mt-0.5">
              Đơn #{order.orderCode}{order.storeName ? ` · ${order.storeName}` : ''}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl shrink-0">
            ×
          </button>
        </div>

        {/* Steps — shrink-0 */}
        <div className="shrink-0 px-5 py-2.5 bg-gray-50 border-b flex items-center gap-2 sm:gap-4">
          <StepDot s="preview" label="Xem trước" />
          <div className="w-6 h-px bg-gray-300 shrink-0" />
          <StepDot s="issuing" label="Phát hành" />
          <div className="w-6 h-px bg-gray-300 shrink-0" />
          <StepDot s="issued"  label="Hoàn tất" />
          <div className="w-6 h-px bg-gray-300 shrink-0" />
          <StepDot s="done"    label="Gửi CQT" />
        </div>

        {/* ── BODY — flex-1, min-h-0 để flex hoạt động đúng ── */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">

          {/* ══ PREVIEW ══ */}
          {step === 'preview' && (
            <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 gap-3">
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-1 gap-4">
                {/* PDF — flex column fill */}
                <div className="rounded-xl border border-gray-200 flex flex-col overflow-hidden">
                  <div className="shrink-0 px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-600">📄 Xem trước hóa đơn</span>
                    <span className="text-xs text-gray-400 italic">Nháp — chưa phát hành</span>
                  </div>

                  {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-sm">Đang tải xem trước...</span>
                    </div>
                  ) : pdfBase64 ? (
                    <iframe
                      src={`data:application/pdf;base64,${pdfBase64}`}
                      className="flex-1 w-full border-0"
                      title="Invoice Preview"
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm">
                      <div className="text-4xl mb-3">📋</div>
                      <p className="font-medium">Xem trước không khả dụng</p>
                      <p className="text-xs mt-1 text-gray-300">Bạn vẫn có thể phát hành hóa đơn</p>
                    </div>
                  )}
                </div>

              </div>{/* end grid */}
            </div>
          )}

          {/* ══ Issuing ══ */}
          {step === 'issuing' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-700 font-semibold">Đang phát hành hóa đơn...</p>
              <p className="text-gray-400 text-sm">Đang ký USB token và gửi lên Viettel</p>
            </div>
          )}

          {/* ══ Issued ══ */}
          {step === 'issued' && issuedResult && (
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center py-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-3xl mb-3">✅</div>
                <h3 className="text-lg font-bold text-gray-900">Phát hành thành công!</h3>
                <p className="text-gray-400 text-sm">Hóa đơn đã ký số và phát hành</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                {[['Số hóa đơn', issuedResult.invoiceNo], ['Ký hiệu', issuedResult.invoiceSeries],
                  ['Mẫu số', issuedResult.templateCode], ['Transaction ID', issuedResult.transactionID],
                  ['Reservation', issuedResult.reservationCode]]
                  .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm gap-2">
                    <span className="text-gray-500 shrink-0">{k}:</span>
                    <span className="font-mono font-semibold text-emerald-800 text-right break-all">{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleOpenPdf}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors">
                📄 Xem PDF hóa đơn
              </button>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-blue-800 mb-1">📨 Gửi lên cơ quan thuế (CQT)</p>
                <p className="text-xs text-blue-400 mb-3">Hóa đơn cần gửi CQT để có hiệu lực pháp lý đầy đủ.</p>
                <button onClick={handleSendCqt}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors">
                  📨 Gửi CQT ngay
                </button>
              </div>
            </div>
          )}

          {/* ══ CQT Sending ══ */}
          {step === 'cqt_sending' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
              <p className="text-gray-700 font-semibold">Đang gửi lên cơ quan thuế...</p>
            </div>
          )}

          {/* ══ Done ══ */}
          {step === 'done' && (
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center py-4">
                <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center text-3xl mb-3">🎉</div>
                <h3 className="text-lg font-bold text-gray-900">Hoàn tất!</h3>
                <p className="text-gray-400 text-sm mt-1">Hóa đơn đã phát hành và gửi CQT</p>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <p className="text-sm text-violet-600">Số hóa đơn: <span className="font-mono font-bold text-violet-800 text-lg">{issuedResult?.invoiceNo}</span></p>
              </div>
              <button onClick={handleOpenPdf}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors">
                📄 Xem PDF hóa đơn
              </button>
            </div>
          )}

          {/* ══ Error ══ */}
          {step === 'error' && (
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center py-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mb-3">❌</div>
                <h3 className="text-lg font-bold text-gray-900">Có lỗi xảy ra</h3>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-mono break-all">{error}</div>
              <button onClick={() => { setStep('preview'); setError(null) }}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors">
                ← Quay lại
              </button>
            </div>
          )}

        </div>{/* end body */}

        {/* ── Footer — shrink-0 ── */}
        {step === 'preview' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors">
              Hủy
            </button>
            <button onClick={handleIssue}
              className="flex-1 sm:flex-none sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              🧾 Phát hành hóa đơn
            </button>
          </div>
        )}
        {step === 'issued' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50">
            <button onClick={onClose}
              className="w-full py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl font-medium text-sm transition-colors">
              Đóng (gửi CQT sau)
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50">
            <button onClick={onClose}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors">
              Xong
            </button>
          </div>
        )}

      </div>
    </div>
  )
}