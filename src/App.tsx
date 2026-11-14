import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './lib/store'
import { ConfirmarProvider } from './components/Confirmar'
import type { Papel } from './lib/types'
import Layout from './components/Layout'
import { CarregandoTela, ErroTela, LogoIcon } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

/**
 * Carrega a tela só quando ela é aberta. Se o site foi atualizado com a aba aberta, os arquivos
 * antigos saem do ar: nesse caso a página recarrega uma vez (no máximo a cada 15 s) e pega a versão nova.
 */
function tela<T extends { default: ComponentType<any> }>(abrir: () => Promise<T>) {
  return lazy(() =>
    abrir().catch((erro) => {
      const chave = 'scalable:recarregou-versao'
      let ultima = 0
      try { ultima = Number(sessionStorage.getItem(chave) || 0) } catch { /* sem armazenamento */ }
      if (Date.now() - ultima > 15000) {
        try { sessionStorage.setItem(chave, String(Date.now())) } catch { /* sem armazenamento */ }
        window.location.reload()
        return new Promise<T>(() => {})
      }
      throw erro
    }),
  )
}

// Cada tela é baixada só quando é aberta (antes o site baixava e preparava todas de uma vez)
const ResetPassword = tela(() => import('./pages/ResetPassword'))
const Legal = tela(() => import('./pages/Legal'))
const Billing = tela(() => import('./pages/Billing'))
const Onboarding = tela(() => import('./pages/Onboarding'))
const Agent = tela(() => import('./pages/Agent'))
const Agenda = tela(() => import('./pages/Agenda'))
const Clinica = tela(() => import('./pages/Clinica'))
const Atendimentos = tela(() => import('./pages/Atendimentos'))
const Customers = tela(() => import('./pages/Customers'))
const Prontuario = tela(() => import('./pages/Prontuario'))
const Finance = tela(() => import('./pages/Finance'))
const Tasks = tela(() => import('./pages/Tasks'))
const WhatsApp = tela(() => import('./pages/WhatsApp'))
const Approvals = tela(() => import('./pages/Approvals'))
const Notifications = tela(() => import('./pages/Notifications'))
const Settings = tela(() => import('./pages/Settings'))

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
        <Route path="pacientes/:id" element={<So papeis={['dono', 'profissional']}><Prontuario /></So>} />
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
        <ConfirmarProvider>
        <ErroTela>
        <Suspense fallback={<CarregandoTela />}>
        <Routes>
          {/* Páginas públicas (abrem mesmo sem login) */}
          <Route path="/termos" element={<Legal kind="termos" />} />
          <Route path="/privacidade" element={<Legal kind="privacidade" />} />
          <Route path="/cookies" element={<Legal kind="cookies" />} />
          <Route path="/reembolso" element={<Legal kind="reembolso" />} />
          <Route path="/*" element={<Gate />} />
        </Routes>
        </Suspense>
        </ErroTela>
        </ConfirmarProvider>
      </AppProvider>
    </BrowserRouter>
  )
}
