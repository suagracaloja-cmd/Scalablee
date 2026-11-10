import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, useId } from 'react'
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react'
import { areaOf } from '../lib/areas'
import { useCountUp } from '../hooks/useCountUp'
import { brl } from '../lib/format'

/**
 * Uma linha que nunca corta nem vaza: se o conteúdo (ex.: R$ 1.667.690,00) não couber na largura,
 * a letra diminui só o necessário (até `min` px). O tamanho máximo vem das classes de texto.
 */
export function Ajusta({ children, className = '', min = 12 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ajustar = () => {
      el.style.fontSize = ''
      if (el.scrollWidth <= el.clientWidth + 0.5) return
      const base = parseFloat(getComputedStyle(el).fontSize)
      el.style.fontSize = `${Math.max(min, Math.floor(base * (el.clientWidth / el.scrollWidth) * 10) / 10)}px`
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    const mo = new MutationObserver(ajustar)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [min])
  return (
    <div ref={ref} className={`overflow-hidden whitespace-nowrap ${className}`}>
      {children}
    </div>
  )
}

/** Faz o conteúdo aparecer da esquerda para a direita, em sequência (índice i). */
export function Reveal({ i = 0, children, className = '', up = false, step = 80, onClick }: { i?: number; children: ReactNode; className?: string; up?: boolean; step?: number; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`${up ? 'reveal-up' : 'reveal'} ${className}`} style={{ '--d': `${i * step}ms` } as CSSProperties}>
      {children}
    </div>
  )
}

/** Símbolo da marca (o mesmo de sempre). flat = só o desenho branco, para fundos coloridos. */
export function LogoIcon({ size = 40, flat = false, className = '' }: { size?: number; flat?: boolean; className?: string }) {
  return <img src={flat ? '/logo-mark-white.png' : '/logo-icon.png'} alt="" aria-hidden="true" style={{ width: size, height: flat ? 'auto' : size }} className={`shrink-0 ${className}`} />
}

export function Logo({ size = 40, word = true, light = false }: { size?: number; word?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label="Scalable">
      <LogoIcon size={size} />
      {word && <img src={light ? '/logo-word-white.png' : '/logo-word.png'} alt="" aria-hidden="true" style={{ height: size * 0.5 }} />}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Reveal className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Reveal>
  )
}

/** Esfera da Coraline AI (a assistente de IA da Scalable). */
export function Orb({ size = 36, className = '' }: { size?: number; className?: string }) {
  return <span className={`orb inline-block shrink-0 rounded-full ${className}`} style={{ width: size, height: size }} aria-hidden="true" />
}

/** Avatar da Coraline AI nas conversas, aprovações e notificações. */
export function AgentMark({ size = 36, className = '' }: { size?: number; rounded?: string; className?: string }) {
  return (
    <span role="img" aria-label="Coraline AI" className={`inline-flex shrink-0 ${className}`}>
      <Orb size={size} />
    </span>
  )
}

/** Etiqueta da área (Vendas, Marketing, Financeiro, Atendimento, Gestão). */
export function AreaChip({ kind, className = '' }: { kind?: string | null; className?: string }) {
  const a = areaOf(kind)
  return (
    <span className={`chip ${a.cls} ${className}`}>
      <a.icon size={11} strokeWidth={2.4} />
      {a.label}
    </span>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  const tituloId = useId()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`reveal-up max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-panel p-6 shadow-2xl sm:rounded-[28px] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={tituloId} className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="icon-btn h-9 w-9" aria-label="Fechar">
            <X size={16} />
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
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
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

/** Selo de variação (↑ 9,9% / ↓ 3,5%). */
export function Delta({ value, inverse = false, onDark = false }: { value: number | null; inverse?: boolean; onDark?: boolean }) {
  if (value === null || !isFinite(value)) return null
  const good = inverse ? value <= 0 : value >= 0
  const cls = onDark ? 'bg-white text-brand' : good ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
  return (
    <span className={`chip ${cls}`}>
      {value >= 0 ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
      {Math.abs(value).toFixed(1).replace('.', ',')}%
    </span>
  )
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
  paid: 'bg-emerald-50 text-emerald-600',
  pending: 'bg-amber-50 text-amber-600',
  cancelled: 'bg-slate-100 text-slate-500',
  lead: 'bg-sky-50 text-sky-600',
  active: 'bg-emerald-50 text-emerald-600',
  inactive: 'bg-slate-100 text-slate-500',
  vip: 'bg-fuchsia-50 text-fuchsia-600',
  high: 'bg-rose-50 text-rose-600',
  normal: 'bg-brand-soft text-brand',
  low: 'bg-slate-100 text-slate-500',
}
export const STATUS_DOT: Record<string, string> = {
  paid: 'bg-emerald-500',
  pending: 'bg-amber-500',
  cancelled: 'bg-slate-400',
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

/** Cartão de status com faixa colorida no topo (estilo "Order list"). */
export function StatusCard({ i = 0, label, value, sub, tone }: { i?: number; label: string; value: ReactNode; sub?: ReactNode; tone: 'blue' | 'green' | 'amber' | 'rose' | 'slate' | 'violet' }) {
  const tones = {
    blue: 'bg-brand text-ink',
    green: 'bg-emerald-400 text-emerald-950',
    amber: 'bg-amber-300 text-amber-950',
    rose: 'bg-rose-400 text-white',
    slate: 'bg-slate-200 text-slate-700',
    violet: 'bg-violet-400 text-white',
  }
  return (
    <Reveal i={i} className="card overflow-hidden">
      <div className={`px-4 py-2.5 text-xs font-bold sm:px-5 ${tones[tone]}`}>{label}</div>
      <div className="px-4 py-4 sm:px-5">
        <Ajusta className="py-0.5 text-[22px] font-bold tracking-tight sm:text-[26px]">{value}</Ajusta>
        {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
      </div>
    </Reveal>
  )
}
