import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './lib/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Agent from './pages/Agent'
import Sales from './pages/Sales'
import Customers from './pages/Customers'
import Finance from './pages/Finance'
import Tasks from './pages/Tasks'
import WhatsApp from './pages/WhatsApp'
import Approvals from './pages/Approvals'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'

function Gate() {
  const { session, loading, company, recovery } = useApp()
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <img src="/logo-icon.png" className="h-14 w-14 animate-pulse" alt="Carregando" />
      </div>
    )
  if (!session) return <Login />
  if (recovery) return <ResetPassword />
  if (!company) return <Onboarding />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="agente" element={<Agent />} />
        <Route path="agente/:threadId" element={<Agent />} />
        <Route path="assistente" element={<Navigate to="/agente" replace />} />
        <Route path="agentes/*" element={<Navigate to="/agente" replace />} />
        <Route path="aprovacoes" element={<Approvals />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route path="vendas" element={<Sales />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="financeiro" element={<Finance />} />
        <Route path="tarefas" element={<Tasks />} />
        <Route path="notificacoes" element={<Notifications />} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Gate />
      </AppProvider>
    </BrowserRouter>
  )
}
