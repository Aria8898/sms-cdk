import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/providers" replace />} />
        <Route path="/providers" element={<Dashboard title="Provider 管理" />} />
        <Route path="/services" element={<Dashboard title="Service 管理" />} />
        <Route path="/cdks" element={<Dashboard title="CDK 管理" />} />
      </Route>
    </Routes>
  )
}
