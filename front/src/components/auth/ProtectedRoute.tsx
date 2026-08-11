import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth.js'

export function ProtectedRoute() {
  const { isAuthenticated, isCheckingAuth } = useAuth()

  if (isCheckingAuth) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
