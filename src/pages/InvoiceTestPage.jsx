import { useState, useRef } from 'react'
import Navbar from '../components/Navbar'
import { createDraftInvoice, issueRetailInvoice, issueBusinessInvoice, getInvoicePdf } from '../services/api'

const Section = ({title,badge,children}) => (
  <div className="card overflow-hidden">
    <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50/60">
      <span className="text-lg">{badge}</span>
      <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
    </div>
    <div className="p-5">{children}</div>
  </div>
)

const Field = ({label,value,onChange,type='text',placeholder}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
    <input type={type} value={value} placeholder={placeholder}
      onChange={e=>onChange(e.target.value)} className="input" />
  </div>
)

/** Hiển thị invoiceNo nổi bật nếu có, ngược lại show JSON lỗi */
const Result = ({data}) => {
  if (!data) return null

  const invoiceNo = data.invoiceNo ?? data.data?.invoiceNo
  const status    = data.status   ?? data.data?.status
  const isErr     = data.error || status === 'ERROR'

  if (!isErr && invoiceNo) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold text-emerald-600 mb-1">✅ Tạo hóa đơn thành công</p>
        <p className="text-sm font-mono font-bold text-emerald-800">
          Số HĐ: <span className="text-lg">{invoiceNo}</span>
        </p>
        {data.status && (
          <p className="text-xs text-emerald-600 mt-1">Trạng thái: {data.status}</p>
        )}
      </div>
    )
  }

  return (
    <div className={`mt-4 rounded-xl border text-xs font-mono overflow-auto max-h-60 p-4 leading-relaxed
      ${isErr ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
      {JSON.stringify(data, null, 2)}
    </div>
  )
}

export default function InvoiceTestPage() {
  const [draft,  setDraft]  = useState({orderCode:'', result:null, loading:false})
  const [retail, setRetail] = useState({orderCode:'', result:null, loading:false})
  const [biz,    setBiz]    = useState({
    orderCode:'', taxCode:'0100109106-507', companyName:'Công ty Test',
    address:'123 Test Q1', email:'test@test.vn', phone:'',
    result:null, loading:false
  })
  const [pdfNo,      setPdfNo]      = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError,   setPdfError]   = useState(null)
  const pdfUrlRef = useRef(null)

  const doAction = async (setState, fn) => {
    setState(p=>({...p, loading:true, result:null}))
    try {
      const r = await fn()
      setState(p=>({...p, result: r.data?.data ?? r.data}))
    } catch(e) {
      setState(p=>({...p, result:{error: e.response?.data || e.message}}))
    } finally {
      setState(p=>({...p, loading:false}))
    }
  }

  const handleOpenPdf = async () => {
    if (!pdfNo.trim()) return
    setPdfLoading(true)
    setPdfError(null)
    // Thu hồi blob URL cũ nếu có
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
    try {
      const blobUrl = await getInvoicePdf(pdfNo.trim())
      pdfUrlRef.current = blobUrl
      window.open(blobUrl, '_blank')
    } catch(e) {
      setPdfError(e.response?.data?.message || e.message || 'Không lấy được file PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Test Invoice API</h1>
          <p className="text-sm text-gray-500 mt-1">Test trực tiếp các endpoint Viettel VinInvoice</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Draft */}
          <Section title="Tạo hóa đơn nháp" badge="📄">
            <Field label="Mã đơn hàng (orderCode)"
              value={draft.orderCode}
              onChange={v=>setDraft(p=>({...p,orderCode:v}))}
              placeholder="POS-20260522-0002" />
            <button disabled={draft.loading||!draft.orderCode}
              onClick={()=>doAction(setDraft, ()=>createDraftInvoice(draft.orderCode, null))}
              className="btn-primary mt-3 disabled:opacity-40">
              {draft.loading ? '⏳ Đang xử lý...' : 'Tạo nháp'}
            </button>
            <Result data={draft.result} />
          </Section>

          {/* Retail */}
          <Section title="Phát hành — Khách lẻ" badge="🧾">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700 mb-3">
              Tạo HĐ khách lẻ · buyerNotGetInvoice = 1 · Không cần MST
            </div>
            <Field label="Mã đơn hàng (orderCode)"
              value={retail.orderCode}
              onChange={v=>setRetail(p=>({...p,orderCode:v}))}
              placeholder="POS-20260522-0002" />
            <button disabled={retail.loading||!retail.orderCode}
              onClick={()=>doAction(setRetail, ()=>issueRetailInvoice(retail.orderCode))}
              className="btn-primary mt-3 disabled:opacity-40 bg-sky-600 hover:bg-sky-500">
              {retail.loading ? '⏳ Đang xử lý...' : 'Phát hành khách lẻ'}
            </button>
            <Result data={retail.result} />
          </Section>

          {/* Business — full width */}
          <div className="md:col-span-2">
            <Section title="Phát hành — Doanh nghiệp (có MST)" badge="🏢">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Mã đơn hàng *"    value={biz.orderCode}    onChange={v=>setBiz(p=>({...p,orderCode:v}))}    placeholder="POS-20260522-0002" />
                <Field label="Mã số thuế *"      value={biz.taxCode}      onChange={v=>setBiz(p=>({...p,taxCode:v}))}      placeholder="0100109106" />
                <Field label="Tên công ty *"     value={biz.companyName}  onChange={v=>setBiz(p=>({...p,companyName:v}))}  placeholder="Công ty TNHH ABC" />
                <Field label="Địa chỉ"           value={biz.address}      onChange={v=>setBiz(p=>({...p,address:v}))}      placeholder="123 Nguyễn Huệ" />
                <Field label="Email nhận HĐ *"   value={biz.email}        onChange={v=>setBiz(p=>({...p,email:v}))}        type="email" placeholder="ketoan@abc.vn" />
                <Field label="SĐT"               value={biz.phone}        onChange={v=>setBiz(p=>({...p,phone:v}))}        placeholder="0901234567" />
              </div>
              <button disabled={biz.loading||!biz.orderCode}
                onClick={()=>{
                  const {orderCode, result, loading, ...buyer} = biz
                  doAction(setBiz, ()=>issueBusinessInvoice(orderCode, buyer))
                }}
                className="btn-primary mt-4 disabled:opacity-40 bg-violet-600 hover:bg-violet-500">
                {biz.loading ? '⏳ Đang xử lý...' : 'Phát hành hóa đơn DN'}
              </button>
              <Result data={biz.result} />
            </Section>
          </div>

          {/* PDF */}
          <Section title="Download PDF hóa đơn" badge="📥">
            <Field label="Số hóa đơn (invoiceNo)" value={pdfNo} onChange={v=>{setPdfNo(v);setPdfError(null)}} placeholder="K26TXM1214" />
            <button
              disabled={!pdfNo.trim() || pdfLoading}
              onClick={handleOpenPdf}
              className="btn-primary mt-3 inline-flex bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40">
              {pdfLoading ? '⏳ Đang tải PDF...' : '📥 Mở PDF'}
            </button>
            {pdfError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                ❌ {pdfError}
              </div>
            )}
            {!pdfNo && (
              <p className="text-xs text-gray-400 mt-3">Nhập số hóa đơn để tải PDF</p>
            )}
          </Section>

          {/* Info */}
          <Section title="Thông tin tài khoản test" badge="ℹ️">
            <dl className="space-y-2 text-sm">
              {[
                ['Base URL',      'api-vinvoice.viettel.vn'],
                ['Username',      '0100109106-507'],
                ['Template',      '1/770'],
                ['Series',        'K23TXM'],
                ['VAT mặc định',  '8%'],
              ].map(([k,v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-gray-500 w-32 shrink-0">{k}:</dt>
                  <dd className="font-mono text-gray-800">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
              ⚠️ Tài khoản <strong>test</strong> — không kiểm tra dữ liệu nghiêm ngặt. HĐ không có giá trị pháp lý.
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}