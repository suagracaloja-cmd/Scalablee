import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { AGENT_META } from '../lib/agents'
import type { Agent, AgentKind } from '../lib/types'
import { useCountUp } from '../hooks/useCountUp'
import { brl } from '../lib/format'

/** Faz o conteúdo aparecer da esquerda para a direita, em sequência (índice i). */
export function Reveal({ i = 0, children, className = '', up = false, step = 90 }: { i?: number; children: ReactNode; className?: string; up?: boolean; step?: number }) {
  return (
    <div className={`${up ? 'reveal-up' : 'reveal'} ${className}`} style={{ '--d': `${i * step}ms` } as CSSProperties}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Reveal className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Reveal>
  )
}

export function AgentAvatar({ agent, kind, size = 40 }: { agent?: Agent; kind?: AgentKind | 'assistant'; size?: number }) {
  const k = agent?.kind ?? kind ?? 'assistant'
  const meta = AGENT_META[k]
  return (
    <div className={`shrink-0 rounded-full bg-gradient-to-br p-[2px] ${meta.ring}`} style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-panel-2" style={{ fontSize: size * 0.45 }}>
        {agent?.avatar_url ? <img src={agent.avatar_url} alt={agent.name} className="h-full w-full object-cover" /> : meta.emoji}
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`reveal-up max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-panel-2" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-panel-2 p-3 text-muted">{icon}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} />
}

export function Money({ value, delay = 0, className = '' }: { value: number; delay?: number; className?: string }) {
  const v = useCountUp(value, 1500, delay)
  return <span className={`tabular-nums ${className}`}>{brl(v)}</span>
}
export function Count({ value, delay = 0, className = '' }: { value: number; delay?: number; className?: string }) {
  const v = useCountUp(value, 1200, delay)
  return <span className={`tabular-nums ${className}`}>{Math.round(v).toLocaleString('pt-BR')}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

export const STATUS_CHIP: Record<string, string> = {
  paid: 'bg-emerald-500/15 text-emerald-300',
  pending: 'bg-amber-500/15 text-amber-300',
  cancelled: 'bg-slate-500/20 text-slate-400',
  lead: 'bg-sky-500/15 text-sky-300',
  active: 'bg-emerald-500/15 text-emerald-300',
  inactive: 'bg-slate-500/20 text-slate-400',
  vip: 'bg-fuchsia-500/15 text-fuchsia-300',
  high: 'bg-rose-500/15 text-rose-300',
  normal: 'bg-brand/15 text-violet-300',
  low: 'bg-slate-500/20 text-slate-400',
}
export const STATUS_LABEL: Record<string, string> = {
  paid: 'Pago',
  pending: 'Pendente',
  cancelled: 'Cancelada',
  lead: 'Lead',
  active: 'Ativo',
  inactive: 'Inativo',
  vip: 'VIP',
  high: 'Urgente',
  normal: 'Normal',
  low: 'Baixa',
}
