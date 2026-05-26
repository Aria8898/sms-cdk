import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Providers from './pages/Providers'
import Services from './pages/Services'
import CdkList from './pages/CdkList'
import CdkGenerate from './pages/CdkGenerate'
import CdkDetail from './pages/CdkDetail'
import PoolMonitor from './pages/PoolMonitor'
import PrivateRoute from './components/PrivateRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/" element={<Navigate to="/providers" replace />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/services" element={<Services />} />
        <Route path="/cdks" element={<CdkList />} />
        <Route path="/cdks/generate" element={<CdkGenerate />} />
        <Route path="/cdks/:id" element={<CdkDetail />} />
        <Route path="/pool-monitor" element={<PoolMonitor />} />
      </Route>
    </Routes>
  )
}
