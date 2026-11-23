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

/** Faturamento acumulado: linha do período (azul da marca) sobre a do período anterior (cinza tracejado). */
export function LineChart({ data, anterior, diario, height = 260 }: { data: Point[]; anterior?: number[]; diario?: number[]; height?: number; delay?: number }) {
  const [box, W] = useWidth()
  const H = height
  const pad = { l: 48, r: 8, t: 12, b: 28 }
  const max = niceMax(Math.max(1, ...data.map((d) => d.value), ...(anterior ?? [])))
  const [hover, setHover] = useState<number | null>(null)
  const innerW = Math.max(1, W - pad.l - pad.r)
  const xDe = (i: number) => pad.l + (i * innerW) / Math.max(1, data.length - 1)
  const yDe = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const pts = data.map((d, i) => ({ x: xDe(i), y: yDe(d.value) }))
  const ptsAnt = (anterior ?? []).map((v, i) => ({ x: xDe(i), y: yDe(v) }))
  const path = useMemo(() => smooth(pts), [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const pathAnt = useMemo(() => smooth(ptsAnt), [JSON.stringify(ptsAnt)]) // eslint-disable-line react-hooks/exhaustive-deps
  const len = useMemo(() => pathLength(pts), [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const area = pts.length ? `${path} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z` : ''
  const key = data.map((d) => d.value).join(',') + ':' + W
  const step = Math.ceil(data.length / (W < 500 ? 4 : 7))
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div ref={box} className="relative w-full min-w-0 select-none" style={{ height: H }}>
      {W > 0 && (
        <svg width={W} height={H} className="block overflow-visible tabular-nums" onMouseLeave={() => setHover(null)} role="img" aria-label="Faturamento acumulado no período">
          {ticks.map((g) => {
            const y = pad.t + (1 - g) * (H - pad.t - pad.b)
            return (
              <g key={g}>
                <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#eceef1" />
                <text x={pad.l - 10} y={y + 4} textAnchor="end" fill="#6b7080" fontSize="11">
                  {axis(max * g)}
                </text>
              </g>
            )
          })}
          {ptsAnt.length > 0 && <path d={pathAnt} fill="none" stroke="#a9aeb8" strokeWidth={1.5} strokeDasharray="4 4" />}
          <g key={key}>
            <path d={area} fill="#2f95ef" fillOpacity={0.06} className="fade-late" style={{ '--d': '500ms' } as CSSProperties} />
            <path d={path} fill="none" stroke="#2f95ef" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="draw" style={{ '--len': len, '--d': '100ms' } as CSSProperties} />
          </g>
          {hover !== null && pts[hover] && (
            <g>
              <line x1={pts[hover].x} x2={pts[hover].x} y1={pad.t} y2={H - pad.b} stroke="#d5d8de" />
              <circle cx={pts[hover].x} cy={pts[hover].y} r={4} fill="#fff" stroke="#2f95ef" strokeWidth={2} />
            </g>
          )}
          {data.map((d, i) =>
            i % step === 0 || i === data.length - 1 ? (
              <text key={i} x={pts[i].x} y={H - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fill="#6b7080" fontSize="11">
                {d.label}
              </text>
            ) : null,
          )}
          {data.map((_, i) => (
            <rect key={'h' + i} x={pts[i].x - innerW / data.length / 2} y={0} width={innerW / data.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
      )}
      {W > 0 && hover !== null && pts[hover] && data[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs tabular-nums text-white"
          style={{ left: Math.min(Math.max(pts[hover].x, 64), W - 64), top: Math.max(0, pts[hover].y - 52) }}
        >
          <div className="text-white/70">{data[hover].label}{diario && diario[hover] !== undefined ? ` · no dia ${brl(diario[hover])}` : ''}</div>
          <div className="font-medium">Acumulado {brl(data[hover].value)}</div>
          {anterior && anterior[hover] !== undefined && <div className="text-white/70">Período anterior {brl(anterior[hover])}</div>}
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
            <span className="fade-late text-xs font-medium tabular-nums text-secondary" style={{ '--d': `${Math.min(delay, 300)}ms` } as CSSProperties}>
              {format(d.value)}
            </span>
          )}
          <div
            className={`grow w-full max-w-[40px] rounded-t-[4px] ${i === top ? 'bg-brand-dark' : 'bg-slate-300'}`}
            style={{ height: `${Math.max(4, (d.value / max) * (height - 56))}px`, '--d': `${i * 40}ms` } as CSSProperties}
            title={`${d.label}: ${format(d.value)}`}
          />
          <span className="max-w-full truncate text-xs text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Barras agrupadas: entradas x saídas. */
export function DualBars({ data, height = 190 }: { data: { label: string; a: number; b: number }[]; height?: number; delay?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]))
  return (
    <div className="flex items-end gap-3 sm:gap-5" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <div className="flex w-full items-end justify-center gap-1.5">
            <div className="grow w-full max-w-[16px] rounded-t-[3px] bg-brand-dark" style={{ height: `${Math.max(2, (d.a / max) * (height - 30))}px`, '--d': `${i * 40}ms` } as CSSProperties} title={`Entradas: ${brl(d.a)}`} />
            <div className="grow w-full max-w-[16px] rounded-t-[3px] bg-slate-300" style={{ height: `${Math.max(2, (d.b / max) * (height - 30))}px`, '--d': `${i * 40 + 20}ms` } as CSSProperties} title={`Saídas: ${brl(d.b)}`} />
          </div>
          <span className="text-xs capitalize text-muted">{d.label}</span>
        </div>
      ))}
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
