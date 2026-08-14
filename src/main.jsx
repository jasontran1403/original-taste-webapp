import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { Toaster } from 'react-hot-toast'

/*
  Chặn trình duyệt tự phóng to trang khi chụm 2 ngón — để cử chỉ pinch chỉ dùng
  cho việc zoom LƯỚI ẢNH của mình, không zoom cả web. Làm hai lớp cho chắc:

  1) Ép thẻ <meta name="viewport"> khóa tỷ lệ (user-scalable=no). Đặt bằng JS vì
     index.html không nằm trong bộ nguồn này; nếu bạn sửa được index.html thì nên
     đặt sẵn ở đó cho gọn (xem ghi chú cuối).
  2) Safari trên iOS bỏ qua touch-action nên phải nuốt thêm sự kiện 'gesture*'
     (API riêng của Safari) thì mới thật sự tắt được zoom trang.
*/
function lockViewportZoom() {
  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    document.head.appendChild(meta)
  }
  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover',
  )

  const swallow = e => e.preventDefault()
  document.addEventListener('gesturestart', swallow, { passive: false })
  document.addEventListener('gesturechange', swallow, { passive: false })
  document.addEventListener('gestureend', swallow, { passive: false })
}
lockViewportZoom()

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000
      }}
    />
  </>
)

// ReactDOM.createRoot(document.getElementById('root')).render(
//   <React.StrictMode><App /></React.StrictMode>
// )
