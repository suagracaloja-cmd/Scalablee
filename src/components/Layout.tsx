import { Suspense, useRef, useState, type FormEvent } from 'react'
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
  Package,
  Search,
  Settings,
  MessageSquareText,
  Stethoscope,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { CarregandoTela, ErroTela, Logo, LogoIcon, Orb } from './ui'
import { CoralinePainel } from './CoralinePainel'
import { useRolou } from '../hooks/useRolou'
import { sair } from '../lib/supabase'
import { AGENT_NAME } from '../lib/areas'
import type { Papel } from '../lib/types'
import { LegalFooter } from './LegalFooter'

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; badge?: 'approvals' | 'conversations' | 'insights'; papeis?: Papel[] }
const NAV: NavItem[] = [
  { to: '/', label: 'Início', icon: LayoutGrid },
  { to: '/agente', label: 'Coraline AI', icon: MessageSquareText },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/aprovacoes', label: 'Aprovações', icon: CheckCircle2, badge: 'approvals', papeis: ['dono', 'recepcao'] },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: 'conversations', papeis: ['dono', 'recepcao'] },
  { to: '/clientes', label: 'Pacientes', icon: Users },
  { to: '/atendimentos', label: 'Atendimentos', icon: Stethoscope, papeis: ['dono', 'recepcao'] },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, papeis: ['dono'] },
  { to: '/estoque', label: 'Estoque', icon: Package },
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
  const rolou = useRolou()
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null)
  const alvoDica = useRef<{ el: HTMLElement; texto: string } | null>(null)
  const loc = useLocation()
  const nav = useNavigate()
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to))

  // Cobrança: aviso de teste acabando/pagamento pendente e bloqueio (só quando COBRANCA_ATIVA=on)
  const bill = billing && billing.enabled ? billing : null
  const free = ['/assinatura', '/configuracoes'].some((p) => loc.pathname.startsWith(p))
  const blocked = !!bill && bill.enforced && !bill.allowed && !free
  const banner = !bill || bill.isento || loc.pathname.startsWith('/assinatura')
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
  // Linha do menu lateral: ícone + nome a partir de 1024 px; abaixo disso só o ícone (o nome aparece ao passar o mouse)
  const linhaCls = (ativo: boolean) =>
    `transicao relative flex h-9 shrink-0 items-center justify-center gap-2.5 rounded-ctl px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand lg:justify-start curta:h-8 ${ativo ? 'nav-ativo font-medium' : 'text-secondary hover:bg-panel hover:text-ink'}`

  // Nome da opção ao passar o mouse no menu lateral. Fica fora do menu, por cima da página, para nunca ser coberto.
  const mostrarDica = (el: HTMLElement, texto: string) => {
    if (window.matchMedia('(min-width: 1024px)').matches) return // com o nome visível, a dica sobra
    alvoDica.current = { el, texto }
    const r = el.getBoundingClientRect()
    setDica({ texto, x: r.right + 8, y: r.top + r.height / 2 })
  }
  const esconderDica = () => {
    alvoDica.current = null
    setDica(null)
  }
  const dicaDe = (texto: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => mostrarDica(e.currentTarget, texto),
    onMouseLeave: esconderDica,
    onFocus: (e: React.FocusEvent<HTMLElement>) => mostrarDica(e.currentTarget, texto),
    onBlur: esconderDica,
  })

  return (
    <div className="min-h-screen overflow-x-clip md:flex">
      {/* Menu lateral (computador): ícone + nome; em telas estreitas, só o ícone. Em telas baixas fica mais compacto e, se faltar espaço, rola. */}
      <aside
        className="sticky top-0 hidden h-screen w-[68px] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-line bg-panel-2/70 px-3 py-5 [scrollbar-width:thin] md:flex lg:w-60 baixa:py-4 curta:py-3"
        onScroll={() => alvoDica.current && mostrarDica(alvoDica.current.el, alvoDica.current.texto)}
      >
        <NavLink to="/" className="mb-6 flex h-9 shrink-0 items-center justify-center gap-2.5 rounded-ctl px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand lg:justify-start baixa:mb-4 curta:mb-3" aria-label="Scalable — início" {...dicaDe('Início')}>
          <LogoIcon size={28} />
          <img src="/logo-word.png" alt="" aria-hidden="true" className="hidden h-[15px] w-auto lg:block" />
        </NavLink>
        <nav className="flex flex-col gap-0.5" aria-label="Menu principal">
          {navItems.map((n) => {
            const c = n.badge ? counts[n.badge] : 0
            const ativo = isActive(n.to)
            return (
              <NavLink key={n.to} to={n.to} aria-label={n.label} className={linhaCls(ativo)} {...dicaDe(n.label)}>
                <n.icon size={18} strokeWidth={1.5} className={`shrink-0 ${ativo ? 'text-brand-ink' : 'text-muted'}`} />
                <span className="hidden min-w-0 flex-1 truncate lg:block">{n.label}</span>
                {c > 0 && (
                  <>
                    <span className="hidden rounded-md bg-rose-50 px-1.5 text-xs font-medium tabular-nums text-rose-700 lg:inline">{c}</span>
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 lg:hidden" aria-hidden="true" />
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
        <div className="mb-2 mt-6 hidden px-2.5 text-xs text-muted lg:block baixa:mt-4">Clínica</div>
        <div className="mx-2 my-4 h-px shrink-0 bg-line lg:hidden" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          {papel === 'dono' && (
            <>
              <NavLink to="/clinica" className={linhaCls(isActive('/clinica'))} aria-label="Clínica e equipe" {...dicaDe('Clínica e equipe')}>
                <Building2 size={18} strokeWidth={1.5} className={`shrink-0 ${isActive('/clinica') ? 'text-brand-ink' : 'text-muted'}`} />
                <span className="hidden truncate lg:block">Clínica e equipe</span>
              </NavLink>
              <NavLink to="/assinatura" className={linhaCls(isActive('/assinatura'))} aria-label="Assinatura" {...dicaDe('Assinatura')}>
                <CreditCard size={18} strokeWidth={1.5} className={`shrink-0 ${isActive('/assinatura') ? 'text-brand-ink' : 'text-muted'}`} />
                <span className="hidden truncate lg:block">Assinatura</span>
              </NavLink>
            </>
          )}
          <NavLink to="/configuracoes" className={linhaCls(isActive('/configuracoes'))} aria-label="Configurações" {...dicaDe('Configurações')}>
            <Settings size={18} strokeWidth={1.5} className={`shrink-0 ${isActive('/configuracoes') ? 'text-brand-ink' : 'text-muted'}`} />
            <span className="hidden truncate lg:block">Configurações</span>
          </NavLink>
        </div>
        <button onClick={() => sair()} className="transicao mt-auto flex h-9 shrink-0 items-center justify-center gap-2.5 rounded-ctl px-2.5 text-sm text-secondary outline-none hover:bg-panel hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-brand lg:justify-start curta:h-8" aria-label="Sair" {...dicaDe('Sair')}>
          <LogOut size={18} strokeWidth={1.5} className="shrink-0" />
          <span className="hidden lg:block">Sair</span>
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior (computador) */}
        <header className={`transicao sticky top-0 z-30 hidden h-16 items-center gap-3 border-b px-8 md:flex ${rolou ? 'border-line bg-bg/95' : 'border-transparent bg-bg'}`}>
          <form onSubmit={search} className="relative w-full max-w-sm">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input h-9 pl-9" placeholder="Buscar paciente" aria-label="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setPainel(true)} className="btn-ghost h-9 gap-2 pl-1.5 pr-3" aria-label={`Perguntar à ${AGENT_NAME}`}>
              <Orb size={24} /> {AGENT_NAME}
            </button>
            {papel !== 'profissional' && (
              <NavLink to="/aprovacoes" className="icon-btn relative h-9 w-9" title="Aprovações" aria-label="Aprovações">
                <CheckCircle2 size={18} strokeWidth={1.5} />
                {counts.approvals > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
              </NavLink>
            )}
            <NavLink to="/notificacoes" className="icon-btn relative h-9 w-9" title="Notificações" aria-label="Notificações">
              <Bell size={18} strokeWidth={1.5} />
              {counts.insights > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
            </NavLink>
            <NavLink to="/configuracoes" className="transicao ml-1 flex items-center gap-2.5 rounded-ctl py-1 pl-1 pr-2.5 outline-none hover:bg-panel focus-visible:ring-2 focus-visible:ring-brand">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-graphite text-xs font-medium text-white">{company?.name?.[0]?.toUpperCase()}</span>
              <span className="max-w-[160px] leading-tight">
                <span className="block truncate text-sm font-medium">{company?.name}</span>
                <span className="block truncate text-xs text-muted">{company?.segment ?? 'Minha clínica'}</span>
              </span>
            </NavLink>
          </div>
        </header>

        {/* Topo (celular): logo à esquerda e só o menu (três linhas) à direita */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] md:hidden">
          <NavLink to="/" className="flex min-w-0 items-center" aria-label="Scalable — início">
            <Logo size={30} />
          </NavLink>
          <button onClick={() => setSheet(true)} className="icon-btn relative h-11 w-11 text-ink" aria-label="Abrir menu" aria-expanded={sheet}>
            <Menu size={20} strokeWidth={1.5} />
            {pendencias > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />}
          </button>
        </header>

        <main key={loc.pathname} className="px-4 pb-10 pt-5 sm:px-6 md:px-8 md:pt-4">
          <div className="mx-auto max-w-[1440px]">
            {banner && (
              <div className="mb-4 flex flex-col gap-2 rounded-ctl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span>{banner}</span>
                <Link to="/assinatura" className="font-medium underline underline-offset-2">Ver assinatura</Link>
              </div>
            )}
            {blocked ? <Navigate to="/assinatura" replace /> : <ErroTela key={loc.pathname}><Suspense fallback={<CarregandoTela />}><Outlet /></Suspense></ErroTela>}
            {/* A conversa ocupa a tela inteira; nela os documentos ficam em Configurações */}
            {!loc.pathname.startsWith('/agente') && <LegalFooter className="mt-12" />}
          </div>
        </main>
      </div>

      {/* Menu do celular: abre pelo botão de três linhas, no canto superior direito */}
      {sheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 md:hidden" onClick={() => setSheet(false)}>
          <nav
            className="reveal-up absolute right-3 top-[max(12px,env(safe-area-inset-top))] flex max-h-[calc(100dvh-24px)] w-[min(320px,calc(100vw-24px))] flex-col overflow-y-auto rounded-panel border border-line bg-panel p-3 shadow-[0_8px_24px_rgba(16,24,40,0.12)]"
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu"
          >
            <div className="mb-3 flex shrink-0 items-center justify-between px-1 pt-1">
              <Logo size={28} />
              <button onClick={() => setSheet(false)} className="icon-btn h-9 w-9" aria-label="Fechar menu">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <button
              onClick={() => (setSheet(false), setPainel(true))}
              className="mb-2 flex h-11 shrink-0 items-center gap-3 rounded-ctl border border-line bg-panel-2 px-2.5 text-left text-sm font-medium"
            >
              <Orb size={24} /> Perguntar à {AGENT_NAME}
            </button>
            <ul className="flex shrink-0 flex-col">
              {todos.map((n) => {
                const c = n.badge ? counts[n.badge] : 0
                return (
                  <li key={n.to}>
                    <NavLink
                      to={n.to}
                      onClick={() => setSheet(false)}
                      className={`transicao flex h-11 items-center gap-3 rounded-ctl px-3 text-[15px] ${isActive(n.to) ? 'bg-panel-2 font-medium text-ink' : 'text-secondary hover:bg-panel-2'}`}
                    >
                      <n.icon size={18} strokeWidth={1.5} className={isActive(n.to) ? 'text-brand-ink' : 'text-muted'} />
                      <span className="flex-1">{n.label}</span>
                      {c > 0 && <span className="rounded-md bg-rose-50 px-1.5 text-xs font-medium tabular-nums text-rose-700">{c}</span>}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
            <button onClick={() => sair()} className="mt-1 flex h-11 shrink-0 items-center gap-3 rounded-ctl px-3 text-[15px] text-rose-700 hover:bg-rose-50">
              <LogOut size={18} strokeWidth={1.5} /> Sair da conta
            </button>
          </nav>
        </div>
      )}

      {dica && (
        <span
          role="tooltip"
          className="dica-entra pointer-events-none fixed z-40 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white md:block"
          style={{ left: dica.x, top: dica.y }}
        >
          {dica.texto}
        </span>
      )}
      <CoralinePainel open={painel} onClose={() => setPainel(false)} />
    </div>
  )
}
