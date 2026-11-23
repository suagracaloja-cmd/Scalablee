import { Component, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, useId } from 'react'
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
    // Durante a contagem animada o texto muda a cada quadro: mede no máximo a cada 150 ms (e ao final),
    // para não forçar o navegador a recalcular a página inteira 60 vezes por segundo
    let espera: number | undefined
    const agendar = () => {
      if (espera !== undefined) return
      espera = window.setTimeout(() => {
        espera = undefined
        ajustar()
      }, 150)
    }
    const ro = new ResizeObserver(agendar)
    ro.observe(el)
    const mo = new MutationObserver(agendar)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
      if (espera !== undefined) window.clearTimeout(espera)
    }
  }, [min])
  return (
    <div ref={ref} className={`overflow-hidden whitespace-nowrap ${className}`}>
      {children}
    </div>
  )
}

/** Faz o conteúdo aparecer da esquerda para a direita, em sequência (índice i). */
export function Reveal({ i = 0, children, className = '', up = false, step = 50, onClick }: { i?: number; children: ReactNode; className?: string; up?: boolean; step?: number; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`${up ? 'reveal-up' : 'reveal'} ${className}`} style={{ '--d': `${Math.min(i, 6) * step}ms` } as CSSProperties}>
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
        <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-secondary">{subtitle}</p>}
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
      <a.icon size={12} strokeWidth={2} />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`reveal-up max-h-[92vh] w-full overflow-y-auto rounded-t-panel border border-line bg-panel p-6 shadow-[0_8px_24px_rgba(16,24,40,0.08)] sm:rounded-panel ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={tituloId} className="text-lg font-semibold">{title}</h2>
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
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-card border border-line bg-panel-2 text-muted">{icon}</div>
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} />
}

export function Money({ value, delay = 0, className = '' }: { value: number; delay?: number; className?: string }) {
  const v = useCountUp(value, 600, Math.min(delay, 200))
  return <span className={`tabular-nums ${className}`}>{brl(v)}</span>
}
export function Count({ value, delay = 0, className = '' }: { value: number; delay?: number; className?: string }) {
  const v = useCountUp(value, 600, Math.min(delay, 200))
  return <span className={`tabular-nums ${className}`}>{Math.round(v).toLocaleString('pt-BR')}</span>
}

/** Variação (↑ 9,9% / ↓ 3,5%): texto discreto na cor do sentido, sem selo. */
export function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean; onDark?: boolean }) {
  if (value === null || !isFinite(value)) return null
  const good = inverse ? value <= 0 : value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${good ? 'text-emerald-700' : 'text-rose-700'}`}>
      {value >= 0 ? <ArrowUpRight size={14} strokeWidth={1.75} /> : <ArrowDownRight size={14} strokeWidth={1.75} />}
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
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-panel-2 text-secondary',
  lead: 'bg-panel-2 text-secondary',
  active: 'bg-emerald-50 text-emerald-700',
  inactive: 'bg-panel-2 text-secondary',
  vip: 'bg-panel-2 text-ink',
  high: 'bg-rose-50 text-rose-700',
  normal: 'bg-panel-2 text-secondary',
  low: 'bg-panel-2 text-muted',
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

/** Cartão de número: um ponto de cor dá o sentido (a pagar, a receber…), o número é o destaque. */
export function StatusCard({ i = 0, label, value, sub, tone }: { i?: number; label: string; value: ReactNode; sub?: ReactNode; tone: 'blue' | 'green' | 'amber' | 'rose' | 'slate' | 'violet' }) {
  const tones = {
    blue: 'bg-brand',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    slate: 'bg-slate-400',
    violet: 'bg-slate-500',
  }
  return (
    <Reveal i={i} className="card p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm text-secondary">
        <span className={`h-2 w-2 shrink-0 rounded-full ${tones[tone]}`} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <Ajusta className="mt-3 py-0.5 text-[24px] font-medium leading-none tabular-nums sm:text-[28px]">{value}</Ajusta>
      {sub && <div className="mt-2 truncate text-xs text-muted">{sub}</div>}
    </Reveal>
  )
}

/** Enquanto uma tela é baixada (fração de segundo na maioria das vezes). */
/** Se uma tela não conseguir abrir (ex.: internet caiu), mostra um aviso em vez de deixar a página em branco. */
export class ErroTela extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false }
  static getDerivedStateFromError() {
    return { erro: true }
  }
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div role="alert" className="card mx-auto my-10 max-w-md p-6 text-center">
        <p className="font-semibold">Não foi possível abrir esta tela.</p>
        <p className="mt-1 text-sm text-muted">Confira a conexão com a internet e tente de novo.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    )
  }
}

export function CarregandoTela() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Carregando">
      <div className="animate-pulse">
        <LogoIcon size={40} />
      </div>
    </div>
  )
}
