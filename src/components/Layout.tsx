import { useState, type FormEvent } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Stethoscope,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Logo, Orb } from './ui'
import { CoralinePainel } from './CoralinePainel'
import { AGENT_NAME } from '../lib/areas'
import type { Papel } from '../lib/types'
import { LegalFooter } from './LegalFooter'

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; badge?: 'approvals' | 'conversations' | 'insights'; papeis?: Papel[] }
const NAV: NavItem[] = [
  { to: '/', label: 'Início', icon: LayoutGrid },
  { to: '/agente', label: 'Coraline AI', icon: Sparkles },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/aprovacoes', label: 'Aprovações', icon: CheckCircle2, badge: 'approvals', papeis: ['dono', 'recepcao'] },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: 'conversations', papeis: ['dono', 'recepcao'] },
  { to: '/clientes', label: 'Pacientes', icon: Users },
  { to: '/atendimentos', label: 'Atendimentos', icon: Stethoscope, papeis: ['dono', 'recepcao'] },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, papeis: ['dono'] },
  { to: '/tarefas', label: 'Tarefas', icon: ClipboardList },
]
const EXTRAS: NavItem[] = [
  { to: '/notificacoes', label: 'Notificações', icon: Bell, badge: 'insights' },
  { to: '/clinica', label: 'Clínica e equipe', icon: Building2, papeis: ['dono'] },
  { to: '/assinatura', label: 'Assinatura', icon: CreditCard, papeis: ['dono'] },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]
const pode = (n: NavItem, papel: Papel) => !n.papeis || n.papeis.includes(papel)

export default function Layout() {
  const { company, counts, billing, papel } = useApp()
  const navItems = NAV.filter((n) => pode(n, papel))
  const [sheet, setSheet] = useState(false)
  const [painel, setPainel] = useState(false)
  const [q, setQ] = useState('')
  const loc = useLocation()
  const nav = useNavigate()
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to))
  const now = new Date()
  const wd = now.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const today = `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${now.getDate()} de ${now.toLocaleDateString('pt-BR', { month: 'long' })}`

  // Cobrança: aviso de teste acabando/pagamento pendente e bloqueio (só quando COBRANCA_ATIVA=on)
  const bill = billing && billing.enabled ? billing : null
  const free = ['/assinatura', '/configuracoes'].some((p) => loc.pathname.startsWith(p))
  const blocked = !!bill && bill.enforced && !bill.allowed && !free
  const banner = !bill || loc.pathname.startsWith('/assinatura')
    ? null
    : !bill.allowed
      ? 'O acesso está pausado: a assinatura não está em dia.'
      : bill.status === 'overdue'
        ? 'Pagamento pendente. Regularize para não perder o acesso.'
        : bill.status === 'trial' && bill.daysLeft !== null && bill.daysLeft <= 3 && !bill.hasSubscription
          ? `Seu teste grátis termina em ${bill.daysLeft} dia(s).`
          : null

  const search = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) nav(`/clientes?q=${encodeURIComponent(q.trim())}`)
  }

  const todos = [...navItems, ...EXTRAS.filter((n) => pode(n, papel))]
  const pendencias = counts.approvals + counts.insights + (papel === 'profissional' ? 0 : counts.conversations)
  const navCls = (to: string) => `flex h-11 w-11 items-center justify-center rounded-full transition ${isActive(to) ? 'nav-ativo' : 'glass text-slate-500 hover:text-ink'}`

  return (
    <div className="min-h-screen overflow-x-clip md:flex">
      {/* Trilho lateral (computador) */}
      <aside className="sticky top-0 hidden h-screen w-[92px] shrink-0 flex-col items-center py-6 md:flex">
        <NavLink to="/" className="reveal mb-8" aria-label="Scalable — início">
          <Logo size={46} word={false} />
        </NavLink>
        <nav className="glass flex flex-1 flex-col items-center gap-2.5 rounded-full px-2.5 py-3 shadow-[0_10px_30px_-18px_rgba(40,90,180,0.35)]" aria-label="Menu principal">
          {navItems.map((n, i) => {
            const c = n.badge ? counts[n.badge] : 0
            const active = isActive(n.to)
            return (
              <NavLink
                key={n.to}
                to={n.to}
                aria-label={n.label}
                className={`reveal group relative flex h-11 w-11 items-center justify-center rounded-full transition ${active ? 'nav-ativo' : 'text-slate-500 hover:bg-white hover:text-ink'}`}
                style={{ '--d': `${i * 45}ms` } as React.CSSProperties}
              >
                <n.icon size={20} strokeWidth={active ? 2.2 : 1.9} />
                {c > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">{c}</span>}
                <span className="pointer-events-none absolute left-[calc(100%+12px)] z-50 whitespace-nowrap rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                  {n.label}
                </span>
              </NavLink>
            )
          })}
        </nav>
        <div className="mt-4 flex flex-col items-center gap-2.5">
          {papel === 'dono' && (
            <>
              <NavLink to="/clinica" className={navCls('/clinica')} title="Clínica e equipe" aria-label="Clínica e equipe">
                <Building2 size={19} />
              </NavLink>
              <NavLink to="/assinatura" className={navCls('/assinatura')} title="Assinatura" aria-label="Assinatura">
                <CreditCard size={19} />
              </NavLink>
            </>
          )}
          <NavLink to="/configuracoes" className={navCls('/configuracoes')} title="Configurações" aria-label="Configurações">
            <Settings size={19} />
          </NavLink>
          <button onClick={() => supabase.auth.signOut()} className="glass flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:text-rose-600" title="Sair" aria-label="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior (computador) */}
        <header className="sticky top-0 z-30 hidden items-center gap-3 px-8 py-5 backdrop-blur-md md:flex">
          <form onSubmit={search} className="reveal relative w-full max-w-sm">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input className="glass h-11 w-full rounded-full pl-11 pr-4 text-sm outline-none ring-brand/20 placeholder:text-muted focus:ring-4" placeholder="Buscar paciente…" aria-label="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <span className="glass reveal hidden rounded-full px-4 py-2.5 text-sm font-semibold lg:inline" style={{ '--d': '60ms' } as React.CSSProperties}>
            {today}
          </span>
          <div className="ml-auto flex items-center gap-2.5">
            <button onClick={() => setPainel(true)} className="glass flex h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-semibold transition hover:shadow-[0_10px_24px_-14px_rgba(47,111,230,0.6)]" aria-label={`Perguntar à ${AGENT_NAME}`}>
              <Orb size={32} /> {AGENT_NAME}
            </button>
            {papel !== 'profissional' && (
              <NavLink to="/aprovacoes" className="glass relative flex h-11 w-11 items-center justify-center rounded-full text-ink" title="Aprovações" aria-label="Aprovações">
                <CheckCircle2 size={19} />
                {counts.approvals > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
              </NavLink>
            )}
            <NavLink to="/notificacoes" className="glass relative flex h-11 w-11 items-center justify-center rounded-full text-ink" title="Notificações" aria-label="Notificações">
              <Bell size={19} />
              {counts.insights > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
            </NavLink>
            <NavLink to="/configuracoes" className="glass flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{company?.name?.[0]?.toUpperCase()}</span>
              <span className="max-w-[160px] leading-tight">
                <span className="block truncate text-sm font-bold">{company?.name}</span>
                <span className="block truncate text-[11px] text-muted">{company?.segment ?? 'Minha clínica'}</span>
              </span>
            </NavLink>
          </div>
        </header>

        {/* Topo (celular): logo à esquerda e só o menu (três linhas) à direita */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[#eef4fd]/85 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
          <NavLink to="/" className="flex min-w-0 items-center gap-2.5" aria-label="Scalable — início">
            <Logo size={38} word={false} />
            <div className="min-w-0 leading-tight">
              <div className="text-[11px] text-muted">Olá</div>
              <div className="truncate text-[15px] font-bold">{company?.name}</div>
            </div>
          </NavLink>
          <button onClick={() => setSheet(true)} className="glass relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink" aria-label="Abrir menu" aria-expanded={sheet}>
            <Menu size={20} />
            {pendencias > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
          </button>
        </header>

        <main key={loc.pathname} className="px-4 pb-10 pt-2 sm:px-6 md:px-8 md:pt-1">
          <div className="mx-auto max-w-[1400px]">
            {banner && (
              <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span>{banner}</span>
                <Link to="/assinatura" className="font-semibold underline underline-offset-2">Ver assinatura</Link>
              </div>
            )}
            {blocked ? <Navigate to="/assinatura" replace /> : <Outlet />}
            {/* A conversa ocupa a tela inteira; nela os documentos ficam em Configurações */}
            {!loc.pathname.startsWith('/agente') && <LegalFooter className="mt-12" />}
          </div>
        </main>
      </div>

      {/* Menu do celular: abre pelo botão de três linhas, no canto superior direito */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm md:hidden" onClick={() => setSheet(false)}>
          <nav
            className="reveal-up absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex max-h-[calc(100dvh-24px)] w-[min(320px,calc(100vw-24px))] flex-col overflow-y-auto rounded-[28px] bg-white/95 p-3 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu"
          >
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <Logo size={30} />
              <button onClick={() => setSheet(false)} className="icon-btn h-9 w-9" aria-label="Fechar menu">
                <X size={17} />
              </button>
            </div>
            <button
              onClick={() => (setSheet(false), setPainel(true))}
              className="mb-1 flex items-center gap-3 rounded-2xl bg-brand-soft px-3 py-2.5 text-left text-sm font-semibold"
            >
              <Orb size={28} /> Perguntar à {AGENT_NAME}
            </button>
            <ul className="flex flex-col">
              {todos.map((n) => {
                const c = n.badge ? counts[n.badge] : 0
                return (
                  <li key={n.to}>
                    <NavLink
                      to={n.to}
                      onClick={() => setSheet(false)}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold ${isActive(n.to) ? 'nav-ativo' : 'text-ink hover:bg-panel-2'}`}
                    >
                      <n.icon size={19} />
                      <span className="flex-1">{n.label}</span>
                      {c > 0 && <span className="rounded-full bg-rose-500 px-2 text-[11px] font-bold text-white">{c}</span>}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
            <button onClick={() => supabase.auth.signOut()} className="mt-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              <LogOut size={18} /> Sair da conta
            </button>
          </nav>
        </div>
      )}

      <CoralinePainel open={painel} onClose={() => setPainel(false)} />
    </div>
  )
}
