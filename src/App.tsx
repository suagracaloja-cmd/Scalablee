import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './lib/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import AgentChat from './pages/AgentChat'
import Assistant from './pages/Assistant'
import Sales from './pages/Sales'
import Customers from './pages/Customers'
import Finance from './pages/Finance'
import Tasks from './pages/Tasks'
import WhatsApp from './pages/WhatsApp'
import Approvals from './pages/Approvals'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'

function Gate() {
  const { session, loading, company } = useApp()
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <img src="/logo-icon.png" className="h-14 w-14 animate-pulse" alt="Carregando" />
      </div>
    )
  if (!session) return <Login />
  if (!company) return <Onboarding />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="assistente" element={<Assistant />} />
        <Route path="agentes" element={<Agents />} />
        <Route path="agentes/:kind" element={<AgentChat />} />
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
