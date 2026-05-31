import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(cfg => {
  const token = sessionStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) { sessionStorage.clear(); window.location.href = '/login' }
  return Promise.reject(err)
})

export const login = (username, password) =>
  api.post('/api/auth/login', { username, password })

export const getInvoiceOrders = (date, page = 0, size = 50, fromDate, toDate) => {
  const params = { page, size }
  if (fromDate && toDate && fromDate !== toDate) {
    params.fromDate = fromDate
    params.toDate   = toDate
  } else if (fromDate) {
    params.date = fromDate
  } else if (date) {
    params.date = date
  }
  return api.get('/api/pos/einvoice/orders', { params })
}

export const createDraftInvoice = (orderCode, buyerInfo) =>
  api.post(`/api/pos/einvoice/draft/${orderCode}`, buyerInfo ?? {})

export const issueRetailInvoice = orderCode =>
  api.post(`/api/pos/einvoice/retail/${orderCode}`, {})

export const issueBusinessInvoice = (orderCode, buyerInfo) =>
  api.post(`/api/pos/einvoice/business/${orderCode}`, buyerInfo)

export const previewInvoice = (orderCode, buyerInfo = null) =>
  api.post(`/api/pos/einvoice/preview/${orderCode}`, buyerInfo ?? {})

export const sendInvoiceToCqt = orderCode =>
  api.post(`/api/pos/einvoice/${orderCode}/send-cqt`, {})

export const getInvoicePdf = async (invoiceNo) => {
  const response = await api.get(`/api/pos/einvoice/${invoiceNo}/pdf`, {
    responseType: 'blob'
  })
  const blob = new Blob([response.data], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

export const getPdfUrl = invoiceNo => `${BASE}/api/pos/einvoice/${invoiceNo}/pdf`

// ─── Public invoice endpoints (no auth) ──────────────────────────────────────
// Dùng invoice_token (UUID ngẫu nhiên) thay vì orderCode để bảo mật public URL
const pub = axios.create({ baseURL: BASE })

/** Lấy thông tin đơn hàng bằng invoice_token từ QR bill */
export const getPublicOrder = token =>
  pub.get(`/api/public/invoice/${token}`)

/** Gửi thông tin xuất hóa đơn (taxCode, companyName, address, invoiceEmail) */
export const submitInvoiceInfo = (token, data) =>
  pub.post(`/api/public/invoice/${token}`, data)

export default api