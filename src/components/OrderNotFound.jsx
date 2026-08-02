/**
 * Màn hình "không tìm thấy đơn hàng".
 *
 * Dùng cho 3 trường hợp:
 *   1. Vào thẳng route gốc "/" — không có mã đơn hàng trên URL.
 *   2. Route không khớp gì cả (catch-all "*").
 *   3. Có token nhưng backend không tìm thấy đơn.
 *
 * Cố ý KHÔNG chuyển hướng sang trang đăng nhập: người vào đây phần lớn là
 * khách hàng quét QR bị sai/thiếu mã, không phải nhân viên. Đá họ sang màn
 * hình đăng nhập chỉ gây bối rối.
 */
export default function OrderNotFound({ message, hint }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50/30 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl">
          🔍
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-2">Không tìm thấy đơn hàng</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          {message || 'Mã đơn hàng không hợp lệ hoặc đã bị xóa.'}
        </p>
        <p className="text-gray-300 text-xs leading-relaxed mt-4">
          {hint || 'Vui lòng quét lại mã QR trên hóa đơn, hoặc liên hệ nhân viên bán hàng để được hỗ trợ.'}
        </p>
      </div>
    </div>
  )
}
