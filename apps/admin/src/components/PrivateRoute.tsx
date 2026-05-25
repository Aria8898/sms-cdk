import { Navigate } from 'react-router-dom'

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const authed = !!localStorage.getItem('admin_token')
  return authed ? <>{children}</> : <Navigate to="/login" replace />
}
