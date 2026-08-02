import axios from 'axios'
import toast from 'react-hot-toast'
import { readToken, wipeAuth } from '../hooks/useAuth'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' }
})

/**
 * Backend trả lỗi xác thực bằng HTTP 200 kèm mã trong body:
 *   901 = chưa xác thực / token không hợp lệ
 *   902 = sai quyền
 *   923 = token hết hạn
 *   924 = token sai chữ ký
 * Nên phải soi body chứ không thể chỉ dựa vào HTTP status.
 */
const AUTH_ERROR_CODES = [901, 902, 923, 924]
const SESSION_EXPIRED_DELAY = 3000

/** Chặn hiện nhiều toast và chuyển hướng nhiều lần khi nhiều request cùng hỏng */
let expiredHandled = false

function handleSessionExpired(message) {
  if (expiredHandled) return
  expiredHandled = true

  toast.error(message || 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    { duration: SESSION_EXPIRED_DELAY })

  // Đợi toast hiện xong rồi mới dọn dữ liệu và quay về đăng nhập —
  // chuyển hướng ngay lập tức thì người dùng không kịp đọc lý do.
  setTimeout(() => {
    wipeAuth()                       // giữ lại username nếu đã tick "Ghi nhớ"
    window.location.href = '/login'
  }, SESSION_EXPIRED_DELAY)
}

/** Bỏ qua các endpoint công khai và chính API đăng nhập */
const isExempt = url => {
  const u = url || ''
  return u.startsWith('/api/tools/') || u.startsWith('/api/public/') || u.startsWith('/api/auth/')
}

api.interceptors.request.use(cfg => {
  const token = readToken()          // tìm ở cả localStorage lẫn sessionStorage
  if (token) cfg.headers.Authorization = `Bearer ${token}`

  // Instance đặt mặc định Content-Type: application/json. Với upload file
  // (FormData) phải XÓA header đó đi, để trình duyệt tự sinh
  // "multipart/form-data; boundary=..." — thiếu boundary thì Spring không
  // parse được và trả HttpMediaTypeNotSupportedException.
  if (typeof FormData !== 'undefined' && cfg.data instanceof FormData) {
    delete cfg.headers['Content-Type']
    delete cfg.headers['content-type']
  }
  return cfg
})

api.interceptors.response.use(
  res => {
    // Lỗi xác thực về dưới dạng HTTP 200 nên phải kiểm tra ở nhánh THÀNH CÔNG
    const code = res.data?.code
    if (AUTH_ERROR_CODES.includes(code) && !isExempt(res.config?.url)) {
      handleSessionExpired(res.data?.message)
    }
    return res
  },
  err => {
    // Phòng trường hợp server/proxy trả 401/403 thật
    const status = err.response?.status
    if ((status === 401 || status === 403) && !isExempt(err.config?.url)) {
      handleSessionExpired(err.response?.data?.message)
    }
    return Promise.reject(err)
  }
)

export const login = (username, password) => {
  expiredHandled = false          // cho phép cảnh báo lại ở phiên mới
  return api.post('/api/auth/login', { username, password })
}

/** Helper: build param ngày cho cả 2 loại endpoint */
const dateParams = (fromDate, toDate, date) => {
  if (fromDate && toDate && fromDate !== toDate) return { fromDate, toDate }
  if (fromDate) return { date: fromDate }
  if (date)     return { date }
  return {}
}

// ─── POS orders ──────────────────────────────────────────────────────────────

export const getInvoiceOrders = (date, page = 0, size = 50, fromDate, toDate, storeId) => {
  const params = { page, size, ...dateParams(fromDate, toDate, date) }
  if (storeId) params.storeId = storeId
  return api.get('/api/pos/einvoice/orders', { params })
}

/** Danh sách cửa hàng để đổ dropdown filter */
export const getStores = () => api.get('/api/pos/einvoice/stores')

// ─── Đơn bán sỉ/lẻ ───────────────────────────────────────────────────────────

export const getSaleInvoiceOrders = (page = 0, size = 50, fromDate, toDate, type, q) => {
  const params = { page, size, ...dateParams(fromDate, toDate) }
  if (type) params.type = type
  if (q)    params.q    = q
  return api.get('/api/pos/einvoice/sale/orders', { params })
}

/** Các loại đơn (type) hiện có — trả về [{ value, label }] */
export const getSaleOrderTypes = () => api.get('/api/pos/einvoice/sale/types')

/** Kế toán sửa trực tiếp thông tin xuất hóa đơn của đơn sỉ/lẻ */
export const updateSaleInvoiceInfo = (orderCode, data) =>
  api.put(`/api/pos/einvoice/sale/${orderCode}/invoice-info`, data)

/** Lấy link + ảnh QR để khách tự nhập thông tin xuất hóa đơn */
export const getSaleInvoiceQr = orderCode =>
  api.get(`/api/pos/einvoice/sale/${orderCode}/invoice-qr`)

export const previewSaleInvoice = (orderCode, buyerInfo = null) =>
  api.post(`/api/pos/einvoice/sale/preview/${orderCode}`, buyerInfo ?? {})

export const issueSaleInvoice = (orderCode, buyerInfo = null) =>
  api.post(`/api/pos/einvoice/sale/issue/${orderCode}`, buyerInfo ?? {})

export const sendSaleInvoiceToCqt = orderCode =>
  api.post(`/api/pos/einvoice/sale/${orderCode}/send-cqt`, {})

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

// ─── Public: đơn bán sỉ/lẻ (QR trên hóa đơn seller) ──────────────────────────

/** Lấy đơn sỉ/lẻ bằng invoice_token từ QR */
export const getPublicSaleOrder = token =>
  pub.get(`/api/public/invoice/sale/${token}`)

/** Khách gửi/cập nhật thông tin xuất hóa đơn cho đơn sỉ/lẻ */
export const submitSaleInvoiceInfo = (token, data) =>
  pub.post(`/api/public/invoice/sale/${token}`, data)

export default api
// ═══════════════════════════════════════════════════════════════════════════
// Tiện ích nội bộ: QR / Ký số / Watermark  (/api/tools/**)
// Các trang này không có trên menu — xem ToolShell.
// ═══════════════════════════════════════════════════════════════════════════

/** Tạo mã QR. type = 'url' | 'text' | 'product' */
export const generateQr = params => {
  const body = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') body.append(k, v)
  })
  return api.post('/api/tools/qr/generate', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

/** URL ảnh logo watermark — dùng trực tiếp trong <img>/canvas nên phải kèm token */
export const fetchWatermarkLogo = () =>
  api.get('/api/tools/watermark/logo', { responseType: 'blob' })

/**
 * Gắn watermark. type = 'image' | 'video'
 * Trả về Blob của file kết quả.
 */
export const applyWatermark = (file, settings, type, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  form.append('settings', JSON.stringify(settings))
  form.append('type', type)
  return api.post('/api/tools/watermark/add', form, {
    responseType: 'blob',
    timeout: 15 * 60 * 1000,          // video dài xử lý lâu
    onUploadProgress: onProgress,
  })
}

/**
 * Ký số PDF. Trả về { blobUrl, filename }, ném Error nếu thất bại.
 *
 * Backend trả lỗi nghiệp vụ (chưa cắm token, sai PIN, sai đường dẫn driver...)
 * bằng HTTP 200 + JSON {success:false,message}. Vì responseType là 'blob' nên
 * axios không hề coi đó là lỗi — phải tự soi content-type, nếu không màn hình
 * sẽ báo "Ký số thành công" với một file JSON đổi đuôi .pdf.
 */
export const signPdf = async ({ file, zones, pin }) => {
  const form = new FormData()
  form.append('file', file)
  form.append('zones', JSON.stringify({ zones }))

  const res = await api.post('/api/tools/sign', form, {
    responseType: 'blob',
    timeout: 5 * 60 * 1000,
    headers: { 'X-Token-Pin': pin },   // PIN chỉ nằm trong header, không log
  })

  await assertPdfBlob(res.data)

  const cd = res.headers['content-disposition'] || ''
  const match = cd.match(/filename[^;=\n]*=\s*(?:["']?)([^"'\n;]+)/i)
  return {
    blobUrl: URL.createObjectURL(res.data),
    filename: match?.[1] || `signed_${Date.now()}.pdf`,
  }
}

/** Ném Error kèm message của backend nếu blob thực chất là JSON lỗi */
async function assertPdfBlob(blob) {
  const type = blob?.type || ''

  if (type.includes('json')) {
    let message = 'Ký số thất bại'
    try {
      const body = JSON.parse(await blob.text())
      message = body.message || body.error || message
    } catch { /* không parse được thì giữ message mặc định */ }
    throw new Error(message)
  }

  // Phòng trường hợp server không set content-type: nhận diện qua chữ ký file.
  // Mọi file PDF hợp lệ đều bắt đầu bằng "%PDF".
  if (!type.includes('pdf')) {
    const head = await blob.slice(0, 5).text()
    if (!head.startsWith('%PDF')) {
      throw new Error('Máy chủ không trả về file PDF hợp lệ')
    }
  }
}

/** Kiểm tra USB token đã sẵn sàng chưa */
export const checkTokenStatus = pin =>
  api.post('/api/tools/sign/token-status', {}, { headers: { 'X-Token-Pin': pin } })

// ═══════════════════════════════════════════════════════════════════════════
// Thư viện tài nguyên (ảnh + video dùng chung)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Backend trả đường dẫn tương đối (/media/xxx.jpg) vì nó không biết mình đang
 * chạy sau domain nào. Ghép với baseURL ở client cho đúng cả dev lẫn production.
 */
export const mediaUrl = path => {
  if (!path) return ''
  return /^https?:\/\//.test(path) ? path : BASE + path
}

/**
 * @param filters { favorite, from, to, q } — bỏ trống thì không lọc.
 *   from/to là epoch millis (thời điểm tải lên).
 */
export const listMedia = (page = 0, size = 40, filters = {}) => {
  const params = { page, size }
  if (filters.favorite) params.favorite = true
  if (filters.from) params.from = filters.from
  if (filters.to)   params.to   = filters.to
  if (filters.q)    params.q    = filters.q
  return api.get('/api/tools/media', { params })
}

export const renameMedia = (id, name) =>
  api.patch(`/api/tools/media/${id}/name`, { name })

export const favoriteMedia = (id, favorite) =>
  api.patch(`/api/tools/media/${id}/favorite`, { favorite })

export const uploadMedia = (files, onProgress) => {
  const form = new FormData()
  Array.from(files).forEach(f => form.append('files', f))
  return api.post('/api/tools/media/upload', form, {
    timeout: 15 * 60 * 1000,
    onUploadProgress: onProgress,
  })
}

/** File lớn hơn ngưỡng này thì chia nhỏ để gửi */
export const CHUNK_THRESHOLD = 8 * 1024 * 1024
const CHUNK_SIZE = 4 * 1024 * 1024

const unwrapEnvelope = res => {
  const env = res?.data
  if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
    throw new Error(env.message || 'Yêu cầu thất bại')
  }
  return env?.data ?? env
}

/**
 * Tải MỘT file. Tự chọn cách gửi theo kích thước:
 *   • Nhỏ  → gửi một lần cho nhanh.
 *   • Lớn  → chia thành nhiều phần 4MB.
 *
 * Chia nhỏ giải quyết 2 vấn đề của video nặng: mạng di động rớt giữa chừng thì
 * chỉ mất một phần thay vì mất trắng, và mỗi request đều nhỏ nên không đụng
 * giới hạn max-file-size của Spring.
 *
 * @param onProgress nhận số 0–100
 */
export const uploadOneFile = async (file, onProgress) => {
  if (file.size <= CHUNK_THRESHOLD) {
    const form = new FormData()
    form.append('files', file)
    const res = await api.post('/api/tools/media/upload', form, {
      timeout: 15 * 60 * 1000,
      onUploadProgress: ev => {
        if (ev.total) onProgress?.(Math.round((ev.loaded / ev.total) * 100))
      },
    })
    const data = unwrapEnvelope(res)
    if (data?.failed?.length) throw new Error(data.failed[0])
    return data?.saved?.[0]
  }

  // ── Gửi theo từng phần ──
  const init = unwrapEnvelope(await api.post('/api/tools/media/chunk/init'))
  const uploadId = init.uploadId
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const blob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size))
    const form = new FormData()
    form.append('uploadId', uploadId)
    form.append('index', String(i))
    form.append('chunk', blob, `part_${i}`)

    await api.post('/api/tools/media/chunk/part', form, {
      timeout: 10 * 60 * 1000,
      onUploadProgress: ev => {
        // Tiến độ tổng = số phần đã xong + phần đang gửi dở
        const partRatio = ev.total ? ev.loaded / ev.total : 0
        onProgress?.(Math.round(((i + partRatio) / totalChunks) * 99))
      },
    })
    onProgress?.(Math.round(((i + 1) / totalChunks) * 99))
  }

  const asset = unwrapEnvelope(await api.post('/api/tools/media/chunk/complete', {
    uploadId,
    totalChunks,
    fileName: file.name,
    contentType: file.type || '',
  }))
  onProgress?.(100)
  return asset
}

export const deleteMedia = id => api.delete(`/api/tools/media/${id}`)

/** Gắn watermark rồi lưu thẳng vào thư viện, trả về metadata của file mới */
export const watermarkAndSave = (file, settings, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  form.append('settings', JSON.stringify(settings))
  return api.post('/api/tools/watermark/save', form, {
    timeout: 15 * 60 * 1000,
    onUploadProgress: onProgress,
  })
}

/**
 * Tải file về máy.
 *
 * Không dùng <a download> trực tiếp với URL của server: thuộc tính download bị
 * bỏ qua khi khác origin (dev chạy 5173 còn API ở 9009), trình duyệt sẽ MỞ file
 * thay vì tải. Nên phải fetch về blob rồi mới tạo link tải.
 *
 * Trên iOS Safari, ảnh/video tải kiểu này vào mục Tệp; muốn lưu vào Ảnh thì
 * người dùng mở file rồi chọn "Lưu vào Ảnh" — đó là giới hạn của iOS, trang web
 * không có quyền ghi thẳng vào thư viện ảnh.
 */
export const downloadFile = async (url, filename) => {
  const res = await fetch(mediaUrl(url))
  if (!res.ok) throw new Error('Không tải được file')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
}
