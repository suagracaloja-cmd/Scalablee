import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bell,
  Bot,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assistente', label: 'Assistente IA', icon: Sparkles },
  { to: '/agentes', label: 'Agentes', icon: Bot },
  { to: '/aprovacoes', label: 'Aprovações', icon: CheckCircle2, badge: 'approvals' as const },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: 'conversations' as const },
  { to: '/vendas', label: 'Vendas', icon: ShoppingBag },
  { to: '/clientes', label: 'Clientes (CRM)', icon: Users },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/tarefas', label: 'Tarefas', icon: ClipboardList },
  { to: '/notificacoes', label: 'Notificações', icon: Bell, badge: 'insights' as const },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]
const MOBILE = ['/', '/assistente', '/aprovacoes', '/whatsapp']

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg font-extrabold tracking-tight">
        Scala<span className="text-gradient">blee</span>
      </span>
    </div>
  )
}

export default function Layout() {
  const { company, counts } = useApp()
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  const links = (onClick?: () => void) =>
    NAV.map((n, i) => {
      const c = n.badge ? counts[n.badge] : 0
      return (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          onClick={onClick}
          className={({ isActive }) =>
            `reveal group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-gradient-to-r from-brand/25 to-transparent text-white' : 'text-muted hover:bg-panel-2 hover:text-slate-200'
            }`
          }
          style={{ '--d': `${i * 40}ms` } as React.CSSProperties}
        >
          <n.icon size={18} />
          <span className="flex-1">{n.label}</span>
          {c > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{c}</span>}
        </NavLink>
      )
    })

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-panel/60 p-4 md:flex">
        <div className="reveal mb-6 px-2">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">{links()}</nav>
        <div className="mt-4 border-t border-line pt-4">
          <div className="truncate px-2 text-sm font-semibold">{company?.name}</div>
          <div className="truncate px-2 text-xs text-muted">{company?.segment}</div>
          <button onClick={() => supabase.auth.signOut()} className="mt-3 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-muted hover:bg-panel-2 hover:text-slate-200">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Topbar mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <NavLink to="/notificacoes" className="relative rounded-lg p-2 text-muted">
            <Bell size={20} />
            {counts.insights > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand pulse-dot" />}
          </NavLink>
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted" aria-label="Menu">
            <Menu size={22} />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setOpen(false)}>
          <div className="reveal h-full w-72 overflow-y-auto border-r border-line bg-panel p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button onClick={() => setOpen(false)} className="p-1 text-muted">
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">{links(() => setOpen(false))}</nav>
            <button onClick={() => supabase.auth.signOut()} className="mt-4 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      )}

      <main key={loc.pathname} className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Navegação inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.filter((n) => MOBILE.includes(n.to)).map((n) => {
          const c = n.badge ? counts[n.badge] : 0
          return (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `relative flex flex-col items-center gap-1 py-2.5 text-[10px] ${isActive ? 'text-white' : 'text-muted'}`}>
              <n.icon size={20} />
              {n.label.split(' ')[0]}
              {c > 0 && <span className="absolute right-[22%] top-1.5 rounded-full bg-brand px-1 text-[9px] font-bold text-white">{c}</span>}
            </NavLink>
          )
        })}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-muted">
          <Menu size={20} />
          Mais
        </button>
      </nav>
    </div>
  )
}
