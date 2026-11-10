import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './lib/store'
import type { Papel } from './lib/types'
import Layout from './components/Layout'
import { LogoIcon } from './components/ui'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Legal from './pages/Legal'
import Billing from './pages/Billing'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Agent from './pages/Agent'
import Agenda from './pages/Agenda'
import Clinica from './pages/Clinica'
import Atendimentos from './pages/Atendimentos'
import Customers from './pages/Customers'
import Finance from './pages/Finance'
import Tasks from './pages/Tasks'
import WhatsApp from './pages/WhatsApp'
import Approvals from './pages/Approvals'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'

/** Telas por papel: quem não tem acesso volta para o início (o banco também bloqueia os dados). */
function So({ papeis, children }: { papeis: Papel[]; children: ReactNode }) {
  const { papel } = useApp()
  return papeis.includes(papel) ? <>{children}</> : <Navigate to="/" replace />
}

function Gate() {
  const { session, loading, company, recovery } = useApp()
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse" role="status" aria-label="Carregando">
          <LogoIcon size={56} />
        </div>
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
        <Route path="agenda" element={<Agenda />} />
        <Route path="aprovacoes" element={<So papeis={['dono', 'recepcao']}><Approvals /></So>} />
        <Route path="whatsapp" element={<So papeis={['dono', 'recepcao']}><WhatsApp /></So>} />
        <Route path="atendimentos" element={<So papeis={['dono', 'recepcao']}><Atendimentos /></So>} />
        <Route path="vendas" element={<Navigate to="/atendimentos" replace />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="pacientes" element={<Customers />} />
        <Route path="financeiro" element={<So papeis={['dono']}><Finance /></So>} />
        <Route path="tarefas" element={<Tasks />} />
        <Route path="notificacoes" element={<Notifications />} />
        <Route path="clinica" element={<So papeis={['dono']}><Clinica /></So>} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="assinatura" element={<So papeis={['dono']}><Billing /></So>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          {/* Páginas públicas (abrem mesmo sem login) */}
          <Route path="/termos" element={<Legal kind="termos" />} />
          <Route path="/privacidade" element={<Legal kind="privacidade" />} />
          <Route path="/cookies" element={<Legal kind="cookies" />} />
          <Route path="/reembolso" element={<Legal kind="reembolso" />} />
          <Route path="/*" element={<Gate />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}
