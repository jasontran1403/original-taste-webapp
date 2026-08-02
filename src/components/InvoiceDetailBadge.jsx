import ReactDOM from 'react-dom'
import { useState, useEffect, useRef } from 'react'
import { fmtDateTime } from '../utils/format'

/**
 * Badge "Có thông tin" + popover chi tiết thông tin xuất hóa đơn.
 * Dùng fixed positioning + portal để thoát khỏi overflow của card/table.
 */
export default function InvoiceDetailBadge({ o }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef()

  const updatePosition = () => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const POPUP_WIDTH = 320
    const POPUP_HEIGHT = 220

    let left = r.left
    let top = r.bottom + 8

    if (left + POPUP_WIDTH > window.innerWidth) left = window.innerWidth - POPUP_WIDTH - 12
    if (top + POPUP_HEIGHT > window.innerHeight) top = r.top - POPUP_HEIGHT - 8

    setPos({ left, top })
  }

  const handleClick = () => {
    if (!show) updatePosition()
    setShow(v => !v)
  }

  useEffect(() => {
    if (!show) return
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [show])

  if (!o.invoiceSubmitted) {
    return <span className="badge bg-gray-100 text-gray-400 text-xs">Chưa có</span>
  }

  const d = o.invoiceDetail || {}
  const hasTax = !!d.taxCode

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        className={`badge cursor-pointer transition-colors ${hasTax
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          : 'bg-sky-100 text-sky-700 hover:bg-sky-200'}`}
      >
        {hasTax ? '🏢 Có thông tin' : '👤 Khách lẻ'}
      </button>

      {show && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShow(false)} />
          <div
            className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-80 text-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="font-semibold text-gray-800 mb-3">Thông tin xuất hóa đơn</p>
            <div className="space-y-2">
              {hasTax && (
                <>
                  <div>
                    <span className="text-gray-500">MST:</span>
                    <div className="font-mono font-medium">{d.taxCode}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Công ty:</span>
                    <div className="font-medium">{d.companyName}</div>
                  </div>
                </>
              )}
              {!hasTax && (
                <p className="text-gray-500 text-xs">
                  Xuất hóa đơn cho khách lẻ — không có mã số thuế.
                </p>
              )}
              {d.email && (
                <div>
                  <span className="text-gray-500">Email:</span>
                  <div className="text-blue-600 break-all">{d.email}</div>
                </div>
              )}
              {d.address && (
                <div>
                  <span className="text-gray-500">Địa chỉ:</span>
                  <div>{d.address}</div>
                </div>
              )}
              {d.submittedAt && (
                <div className="pt-2 border-t text-xs text-gray-400">
                  Cập nhật: {fmtDateTime(d.submittedAt)}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
