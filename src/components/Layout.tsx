import { useState, type FormEvent } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Logo } from './ui'
import { LegalFooter } from './LegalFooter'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid },
  { to: '/agente', label: 'Agente SCALABLE', icon: Sparkles },
  { to: '/aprovacoes', label: 'Aprovações', icon: CheckCircle2, badge: 'approvals' as const },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: 'conversations' as const },
  { to: '/vendas', label: 'Vendas', icon: ShoppingBag },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/tarefas', label: 'Tarefas', icon: ClipboardList },
]
const MOBILE = ['/', '/agente', '/aprovacoes', '/whatsapp']

export default function Layout() {
  const { company, counts, billing } = useApp()
  const [sheet, setSheet] = useState(false)
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

  return (
    <div className="min-h-screen md:flex">
      {/* Trilho lateral (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-[92px] shrink-0 flex-col items-center py-6 md:flex">
        <NavLink to="/" className="reveal mb-8">
          <Logo size={46} word={false} />
        </NavLink>
        <nav className="flex flex-1 flex-col items-center gap-2.5 rounded-full bg-panel px-2.5 py-3 shadow-[0_1px_12px_rgba(16,24,40,0.05)]">
          {NAV.map((n, i) => {
            const c = n.badge ? counts[n.badge] : 0
            const active = isActive(n.to)
            return (
              <NavLink
                key={n.to}
                to={n.to}
                className={`reveal group relative flex h-11 w-11 items-center justify-center rounded-full transition ${
                  active ? 'bg-brand text-ink shadow-[0_8px_18px_-6px_rgba(72,168,252,0.8)]' : 'text-slate-500 hover:bg-panel-2 hover:text-ink'
                }`}
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
          <NavLink to="/assinatura" className={`flex h-11 w-11 items-center justify-center rounded-full ${isActive('/assinatura') ? 'bg-brand text-ink' : 'bg-panel text-slate-500 hover:text-ink'}`} title="Assinatura">
            <CreditCard size={19} />
          </NavLink>
          <NavLink to="/configuracoes" className={`flex h-11 w-11 items-center justify-center rounded-full ${isActive('/configuracoes') ? 'bg-brand text-ink' : 'bg-panel text-slate-500 hover:text-ink'}`} title="Configurações">
            <Settings size={19} />
          </NavLink>
          <button onClick={() => supabase.auth.signOut()} className="flex h-11 w-11 items-center justify-center rounded-full bg-panel text-slate-500 hover:text-rose-600" title="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior (desktop) */}
        <header className="sticky top-0 z-30 hidden items-center gap-3 bg-bg/80 px-8 py-5 backdrop-blur-md md:flex">
          <form onSubmit={search} className="reveal relative w-full max-w-sm">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input className="h-11 w-full rounded-full bg-panel pl-11 pr-4 text-sm outline-none ring-brand/20 placeholder:text-muted focus:ring-4" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <span className="reveal hidden rounded-full bg-panel px-4 py-2.5 text-sm font-semibold lg:inline" style={{ '--d': '60ms' } as React.CSSProperties}>
            {today}
          </span>
          <div className="ml-auto flex items-center gap-2.5">
            <NavLink to="/aprovacoes" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-panel text-ink hover:bg-white/70" title="Aprovações">
              <CheckCircle2 size={19} />
              {counts.approvals > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
            </NavLink>
            <NavLink to="/notificacoes" className="relative flex h-11 w-11 items-center justify-center rounded-full bg-panel text-ink hover:bg-white/70" title="Notificações">
              <Bell size={19} />
              {counts.insights > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
            </NavLink>
            <NavLink to="/configuracoes" className="flex items-center gap-3 rounded-full bg-panel py-1.5 pl-1.5 pr-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{company?.name?.[0]?.toUpperCase()}</span>
              <span className="max-w-[160px] leading-tight">
                <span className="block truncate text-sm font-bold">{company?.name}</span>
                <span className="block truncate text-[11px] text-muted">{company?.segment ?? 'Minha empresa'}</span>
              </span>
            </NavLink>
          </div>
        </header>

        {/* Topo (celular) */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/85 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
          <NavLink to="/" className="flex items-center gap-2.5">
            <Logo size={38} word={false} />
            <div className="leading-tight">
              <div className="text-[11px] text-muted">Olá 👋</div>
              <div className="max-w-[170px] truncate text-[15px] font-bold">{company?.name}</div>
            </div>
          </NavLink>
          <div className="flex items-center gap-2">
            <NavLink to="/aprovacoes" className="icon-btn relative">
              <CheckCircle2 size={18} />
              {counts.approvals > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />}
            </NavLink>
            <NavLink to="/notificacoes" className="icon-btn relative">
              <Bell size={18} />
              {counts.insights > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />}
            </NavLink>
          </div>
        </header>

        <main key={loc.pathname} className="px-4 pb-32 pt-2 sm:px-6 md:px-8 md:pb-10 md:pt-1">
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

      {/* Menu flutuante (celular) */}
      <nav className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-full bg-graphite p-2 shadow-2xl md:hidden">
        {NAV.filter((n) => MOBILE.includes(n.to)).map((n) => {
          const active = isActive(n.to)
          const c = n.badge ? counts[n.badge] : 0
          return (
            <NavLink key={n.to} to={n.to} className={`relative flex h-12 flex-1 items-center justify-center rounded-full transition ${active ? 'bg-white text-ink' : 'text-white/60'}`} aria-label={n.label}>
              <n.icon size={21} />
              {c > 0 && <span className="absolute right-[24%] top-2 h-2 w-2 rounded-full bg-rose-500" />}
            </NavLink>
          )
        })}
        <button onClick={() => setSheet(true)} className="flex h-12 flex-1 items-center justify-center rounded-full text-white/60" aria-label="Mais">
          <Menu size={21} />
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm md:hidden" onClick={() => setSheet(false)}>
          <div className="reveal-up absolute inset-x-0 bottom-0 rounded-t-[32px] bg-panel p-5 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <Logo size={34} />
              <button onClick={() => setSheet(false)} className="icon-btn">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[...NAV, { to: '/notificacoes', label: 'Notificações', icon: Bell, badge: 'insights' as const }, { to: '/assinatura', label: 'Assinatura', icon: CreditCard }, { to: '/configuracoes', label: 'Configurações', icon: Settings }].map((n) => {
                const c = 'badge' in n && n.badge ? counts[n.badge] : 0
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={() => setSheet(false)}
                    className={`relative flex flex-col items-center gap-2 rounded-3xl px-2 py-4 text-center text-xs font-semibold ${isActive(n.to) ? 'bg-brand text-ink' : 'bg-panel-2 text-ink'}`}
                  >
                    <n.icon size={21} />
                    {n.label}
                    {c > 0 && <span className="absolute right-3 top-3 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{c}</span>}
                  </NavLink>
                )
              })}
            </div>
            <button onClick={() => supabase.auth.signOut()} className="btn-ghost mt-4 w-full text-rose-600">
              <LogOut size={16} /> Sair da conta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
