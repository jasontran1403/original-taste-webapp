import { useEffect, useRef } from 'react'

/**
 * Cử chỉ phóng to/thu nhỏ lưới ảnh — kiểu ứng dụng Ảnh của iPhone.
 *
 * "Zoom" ở đây = ĐỔI SỐ CỘT: chụm hai ngón lại (pinch in) → nhiều cột hơn →
 * ô nhỏ đi; xòe hai ngón ra (pinch out) → ít cột hơn → ô to lên.
 *
 * Cách kích hoạt:
 *   • Cảm ứng (iPhone/Android): chạm HAI NGÓN rồi chụm/xòe.
 *   • Máy tính: giữ Ctrl/⌘ và lăn chuột, hoặc chụm trên trackpad (macOS gửi
 *     wheel kèm ctrlKey). Lăn chuột THƯỜNG vẫn cuộn trang như cũ để không phá
 *     cơ chế tải-thêm-khi-cuộn của thư viện.
 *
 * Listener gắn theo kiểu non-passive để chặn được zoom mặc định của trình duyệt.
 *
 * @param targetRef  ref tới phần tử bao lưới ảnh
 * @param opts.columnsRef  ref giữ số cột hiện tại (tránh closure cũ)
 * @param opts.boundsRef   ref giữ { min, max } số cột cho khổ màn hình hiện tại
 * @param opts.setColumns  hàm cập nhật số cột
 */
export function usePinchZoom(targetRef, { columnsRef, boundsRef, setColumns }) {
  const pinch = useRef(null)          // { startDist, startCols, last }
  const wheelReadyAt = useRef(0)      // tiết lưu wheel để không nhảy vọt

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    const clamp = c => {
      const { min, max } = boundsRef.current
      return Math.max(min, Math.min(max, c))
    }

    const dist = t =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onTouchStart = e => {
      if (e.touches.length === 2) {
        pinch.current = {
          startDist: dist(e.touches),
          startCols: columnsRef.current,
          last: columnsRef.current,
        }
      }
    }

    const onTouchMove = e => {
      if (!pinch.current || e.touches.length !== 2) return
      e.preventDefault()                       // chặn zoom trang của trình duyệt
      const ratio = dist(e.touches) / pinch.current.startDist
      if (!isFinite(ratio) || ratio <= 0) return
      // Xòe ra (ratio > 1) → ít cột hơn (ô to hơn)
      const next = clamp(Math.round(pinch.current.startCols / ratio))
      if (next !== pinch.current.last) {
        pinch.current.last = next
        setColumns(next)
      }
    }

    const onTouchEnd = e => {
      if (e.touches.length < 2) pinch.current = null
    }

    const onWheel = e => {
      if (!e.ctrlKey) return                   // chỉ zoom khi Ctrl/⌘ hoặc pinch trackpad
      e.preventDefault()
      const now = Date.now()
      if (now < wheelReadyAt.current) return
      wheelReadyAt.current = now + 90
      // Lăn lên / chụm ra (deltaY < 0) → ít cột hơn (phóng to)
      setColumns(clamp(columnsRef.current + (e.deltaY < 0 ? -1 : 1)))
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    el.addEventListener('touchcancel', onTouchEnd,  { passive: true })
    el.addEventListener('wheel',       onWheel,     { passive: false })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('wheel',       onWheel)
    }
  }, [targetRef, columnsRef, boundsRef, setColumns])
}

/** Giới hạn số cột theo khổ màn hình để zoom không ra bố cục kỳ cục. */
export function zoomBounds(width) {
  if (width < 640)  return { min: 2, max: 8 }
  if (width < 1024) return { min: 2, max: 10 }
  return { min: 3, max: 12 }
}
