import { useState, useEffect } from 'react'

export function useAuth() {
  const [auth, setAuth] = useState(() => {
    const token = sessionStorage.getItem('token')
    const role  = sessionStorage.getItem('role')
    return token ? { token, role } : null
  })

  const saveAuth = (token, role) => {
    sessionStorage.setItem('token', token)
    sessionStorage.setItem('role', role)
    setAuth({ token, role })
  }

  const clearAuth = () => {
    sessionStorage.clear()
    setAuth(null)
  }

  const isAccountant = auth?.role === 'ACCOUNTANT' || auth?.role === 'SUPERADMIN'

  return { auth, saveAuth, clearAuth, isAccountant }
}
