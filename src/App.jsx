import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Kunden from './pages/Kunden'
import Einstellungen from './pages/Einstellungen'
import Dokumente from './pages/Dokumente'
import DokumentNeu from './pages/DokumentNeu'
import DokumentDetail from './pages/DokumentDetail'
import DokumentBearbeiten from './pages/DokumentBearbeiten'
import PrivateRoute from './components/PrivateRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />
        <Route path="/kunden" element={
          <PrivateRoute>
            <Kunden />
          </PrivateRoute>
        } />
        <Route path="/einstellungen" element={
          <PrivateRoute>
            <Einstellungen />
          </PrivateRoute>
        } />
        <Route path="/dokumente" element={
          <PrivateRoute>
            <Dokumente />
          </PrivateRoute>
        } />
        <Route path="/dokumente/neu" element={
          <PrivateRoute>
            <DokumentNeu />
          </PrivateRoute>
        } />
        <Route path="/dokumente/:id" element={
          <PrivateRoute>
            <DokumentDetail />
          </PrivateRoute>
        } />
        <Route path="/dokumente/:id/bearbeiten" element={
          <PrivateRoute>
            <DokumentBearbeiten />
          </PrivateRoute>
        } />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
