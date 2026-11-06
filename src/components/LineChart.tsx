import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { brl, brlShort } from '../lib/format'

type Point = { label: string; value: number }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(160, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Curva de vendas: a linha é "desenhada" ao carregar; faixa destacada no ponto em foco. */
export function LineChart({ data, height = 250, delay = 400 }: { data: Point[]; height?: number; delay?: number }) {
  const [box, W] = useWidth()
  const H = height
  const pad = { l: 40, r: 10, t: 34, b: 28 }
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)))
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  const [hover, setHover] = useState<number | null>(null)
  const focus = hover ?? maxIdx
  const innerW = Math.max(1, W - pad.l - pad.r)
  const pts = data.map((d, i) => ({
    x: pad.l + (i * innerW) / Math.max(1, data.length - 1),
    y: pad.t + (1 - d.value / max) * (H - pad.t - pad.b),
  }))
  const path = useMemo(() => smooth(pts), [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const len = useMemo(() => pathLength(pts), [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const area = pts.length ? `${path} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z` : ''
  const key = data.map((d) => d.value).join(',') + ':' + W
  const step = Math.ceil(data.length / (W < 500 ? 4 : 7))
  const bandW = Math.min(46, Math.max(14, innerW / data.length))
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div ref={box} className="relative w-full min-w-0 select-none" style={{ height: H }}>
      {W > 0 && (
        <svg width={W} height={H} className="block overflow-visible" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#48a8fc" stopOpacity="0.22" />
              <stop offset="1" stopColor="#48a8fc" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lc-band" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#48a8fc" stopOpacity="0.16" />
              <stop offset="1" stopColor="#48a8fc" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((g) => {
            const y = pad.t + (1 - g) * (H - pad.t - pad.b)
            return (
              <g key={g}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#eef0f3" />
                <text x={0} y={y + 4} fill="#a0a5b1" fontSize="11">
                  {axis(max * g)}
                </text>
              </g>
            )
          })}
          {pts[focus] && <rect x={pts[focus].x - bandW / 2} y={pad.t - 6} width={bandW} height={H - pad.t - pad.b + 6} rx={bandW / 2} fill="url(#lc-band)" className="transition-all duration-300" />}
          <g key={key}>
            <path d={area} fill="url(#lc-fill)" className="fade-late" style={{ '--d': `${delay + 1300}ms` } as CSSProperties} />
            <path d={path} fill="none" stroke="#48a8fc" strokeWidth={3} strokeLinecap="round" className="draw" style={{ '--len': len, '--d': `${delay}ms` } as CSSProperties} />
          </g>
          {pts[focus] && (
            <g className="fade-late" style={{ '--d': `${hover !== null ? 0 : delay + 1500}ms` } as CSSProperties}>
              <circle cx={pts[focus].x} cy={pts[focus].y} r={6.5} fill="#fff" stroke="#48a8fc" strokeWidth={3} />
            </g>
          )}
          {data.map((d, i) =>
            i % step === 0 || i === data.length - 1 ? (
              <text key={i} x={pts[i].x} y={H - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fill="#a0a5b1" fontSize="11">
                {d.label}
              </text>
            ) : null,
          )}
          {data.map((_, i) => (
            <rect key={'h' + i} x={pts[i].x - innerW / data.length / 2} y={0} width={innerW / data.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
      )}
      {W > 0 && pts[focus] && data[focus] && (
        <div
          className="fade-late pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-xl bg-ink px-2.5 py-1.5 text-center text-[11px] font-semibold text-white shadow-lg"
          style={{ left: Math.min(Math.max(pts[focus].x, 50), W - 50), top: 0, '--d': `${hover !== null ? 0 : delay + 1500}ms` } as CSSProperties}
        >
          <div className="text-[10px] font-medium text-white/60">{data[focus].label}</div>
          {brl(data[focus].value)}
        </div>
      )}
    </div>
  )
}

/** Barras arredondadas que "crescem"; a maior fica destacada. */
export function Bars({ data, height = 170, delay = 300, format = brlShort }: { data: { label: string; value: number }[]; height?: number; delay?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const top = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0)
  return (
    <div className="flex items-end gap-2 sm:gap-3" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label + i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          {i === top && (
            <span className="fade-late rounded-lg bg-ink px-2 py-1 text-[10px] font-bold text-white" style={{ '--d': `${delay + 900}ms` } as CSSProperties}>
              {format(d.value)}
            </span>
          )}
          <div
            className={`grow w-full max-w-[44px] rounded-full ${i === top ? 'bg-brand' : 'bg-brand-soft'}`}
            style={{ height: `${Math.max(6, (d.value / max) * (height - 56))}px`, '--d': `${delay + i * 70}ms` } as CSSProperties}
            title={`${d.label}: ${format(d.value)}`}
          />
          <span className="max-w-full truncate text-[11px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Barras agrupadas: entradas x saídas. */
export function DualBars({ data, height = 190, delay = 300 }: { data: { label: string; a: number; b: number }[]; height?: number; delay?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]))
  return (
    <div className="flex items-end gap-3 sm:gap-5" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <div className="flex w-full items-end justify-center gap-1.5">
            <div className="grow w-full max-w-[18px] rounded-full bg-brand" style={{ height: `${Math.max(5, (d.a / max) * (height - 30))}px`, '--d': `${delay + i * 90}ms` } as CSSProperties} title={`Entradas: ${brl(d.a)}`} />
            <div className="grow w-full max-w-[18px] rounded-full bg-ink" style={{ height: `${Math.max(5, (d.b / max) * (height - 30))}px`, '--d': `${delay + i * 90 + 60}ms` } as CSSProperties} title={`Saídas: ${brl(d.b)}`} />
          </div>
          <span className="text-[11px] capitalize text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export const DONUT_COLORS = ['#48a8fc', '#0f172a', '#8cc2ff', '#f59e0b', '#10b981', '#ec4899']

/** Rosca animada: cada fatia aparece em sequência. */
export function Donut({ data, size = 170, delay = 400, center }: { data: { label: string; value: number }[]; size?: number; delay?: number; center?: { value: string; label: string } }) {
  const total = data.reduce((a, b) => a + b.value, 0) || 1
  const r = 15.9155
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
        <circle cx="21" cy="21" r={r} fill="none" stroke="#f1f3f6" strokeWidth="4.5" />
        {data.map((d, i) => {
          const pct = (d.value / total) * 100
          const gap = data.length > 1 ? 1.2 : 0
          const len = Math.max(0.1, pct - gap)
          const seg = (
            <circle
              key={d.label}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={`${len} ${100 - len}`}
              strokeDashoffset={-acc}
              className="fade-late"
              style={{ '--d': `${delay + i * 180}ms` } as CSSProperties}
            />
          )
          acc += pct
          return seg
        })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[15px] font-bold leading-tight">{center.value}</span>
          <span className="text-[11px] text-muted">{center.label}</span>
        </div>
      )}
    </div>
  )
}

function axis(v: number) {
  if (v >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return String(Math.round(v))
}
function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return m * p
}
function smooth(p: { x: number; y: number }[]) {
  if (!p.length) return ''
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]
    const b = p[i]
    const cx = (a.x + b.x) / 2
    d += ` C ${cx} ${a.y}, ${cx} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}
function pathLength(p: { x: number; y: number }[]) {
  let l = 0
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) * 1.25
  return Math.ceil(l + 50)
}
