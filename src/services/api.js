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

/** Xem trước PDF hóa đơn nháp (không phát hành) — trả về base64 */
export const previewInvoice = (orderCode, buyerInfo = null) =>
  api.post(`/api/pos/einvoice/preview/${orderCode}`, buyerInfo ?? {})

/** Gửi hóa đơn đã phát hành lên cơ quan thuế */
export const sendInvoiceToCqt = orderCode =>
  api.post(`/api/pos/einvoice/${orderCode}/send-cqt`, {})

/** Tải PDF hóa đơn qua axios (có Authorization header) */
export const getInvoicePdf = async (invoiceNo) => {
  const response = await api.get(`/api/pos/einvoice/${invoiceNo}/pdf`, {
    responseType: 'blob'
  })
  const blob = new Blob([response.data], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

// Giữ lại để tương thích với các nơi khác import
export const getPdfUrl = invoiceNo => `${BASE}/api/pos/einvoice/${invoiceNo}/pdf`

const pub = axios.create({ baseURL: BASE })
export const getPublicOrder = orderCode =>
  pub.get('/api/public/invoice', { params: { orderCode } })
export const submitInvoiceInfo = (orderCode, data) =>
  pub.post('/api/public/invoice/submit', data, { params: { orderCode } })

export default api