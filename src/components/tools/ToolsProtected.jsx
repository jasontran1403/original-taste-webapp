import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  readToolsToken, decodeToken, isExpired, verifyToken, wipeToolsToken,
} from '../../services/toolsAuth'

const EXPIRED_MSG = 'Hết phiên đăng nhập, vui lòng đăng nhập lại.'

/**
 * Cổng chặn khu /tools.
 *
 *  • Chưa đăng nhập      → đá thẳng sang /tools/login (không báo gì).
 *  • Token đã hết hạn    → hiện toast "hết phiên" rồi đá sang /tools/login.
 *  • Token còn hạn nhưng sẽ hết trong lúc đang mở tab → hẹn giờ, tới hạn thì
 *    cũng toast + đá ra, không cần bấm gì.
 *  • Token bị sửa tay (sai chữ ký) → dọn sạch + đá ra.
 */
export default function ToolsProtected({ children }) {
  const loc = useLocation()
  const token = readToolsToken()
  const expired = !!token && isExpired(token)
  const valid = !!token && !expired

  const [kicked, setKicked] = useState(false)
  const notified = useRef(false)

  // Vào trang mà token đã hết hạn → báo một lần rồi dọn phiên
  useEffect(() => {
    if (expired && !notified.current) {
      notified.current = true
      toast.error(EXPIRED_MSG)
      wipeToolsToken()            // giữ username nếu đã tick "Ghi nhớ"
    }
  }, [expired])

  // Chống token sửa tay: xác thực chữ ký (async). Sai thì đá ra.
  useEffect(() => {
    if (!valid) return
    let alive = true
    verifyToken(token).then(p => {
      if (alive && !p) { wipeToolsToken(); setKicked(true) }
    })
    return () => { alive = false }
  }, [token, valid])

  // Token còn sống → hẹn giờ đúng lúc hết hạn để đá ra ngay cả khi để yên tab
  useEffect(() => {
    if (!valid) return
    const p = decodeToken(token)
    const ms = Math.max(0, p.exp * 1000 - Date.now())
    const timer = setTimeout(() => {
      if (!notified.current) {
        notified.current = true
        toast.error(EXPIRED_MSG)
      }
      wipeToolsToken()
      setKicked(true)
    }, ms)
    return () => clearTimeout(timer)
  }, [token, valid])

  if (!valid || kicked) {
    return <Navigate to="/tools/login" state={{ from: loc }} replace />
  }
  return children
}
