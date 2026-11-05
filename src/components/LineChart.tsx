import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { brl, brlShort } from '../lib/format'

type Point = { label: string; value: number }

/** Gráfico de linha em SVG; a linha é "desenhada" ao carregar e redesenhada quando os dados mudam. */
export function LineChart({ data, height = 240, delay = 400 }: { data: Point[]; height?: number; delay?: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = height
  const pad = { l: 8, r: 8, t: 16, b: 28 }
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.15
  const pts = data.map((d, i) => ({
    x: pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1),
    y: pad.t + (1 - d.value / max) * (H - pad.t - pad.b),
  }))
  const path = useMemo(() => smooth(pts), [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const len = useMemo(() => pathLength(pts), [JSON.stringify(pts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const area = pts.length ? `${path} L ${pts[pts.length - 1].x} ${H - pad.b} L ${pts[0].x} ${H - pad.b} Z` : ''
  const key = data.map((d) => d.value).join(',') + ':' + W // re-anima quando os dados mudam
  const step = Math.ceil(data.length / 7)

  return (
    <div ref={box} className="relative w-full min-w-0" style={{ minHeight: height }}>
      {W > 0 && <svg viewBox={`0 0 ${W} ${H}`} height={H} className="block w-full overflow-visible">
        <defs>
          <linearGradient id="lc-stroke" x1="0" x2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + g * (H - pad.t - pad.b)} y2={pad.t + g * (H - pad.t - pad.b)} stroke="#262741" strokeDasharray="4 6" />
        ))}
        <g key={key}>
          <path d={area} fill="url(#lc-fill)" className="fade-late" style={{ '--d': `${delay + 1200}ms` } as CSSProperties} />
          <path
            d={path}
            fill="none"
            stroke="url(#lc-stroke)"
            strokeWidth={3}
            strokeLinecap="round"
            className="draw"
            style={{ '--len': len, '--d': `${delay}ms` } as CSSProperties}
          />
        </g>
        {hover !== null && pts[hover] && (
          <>
            <line x1={pts[hover].x} x2={pts[hover].x} y1={pad.t} y2={H - pad.b} stroke="#3b3c5e" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r={5} fill="#0b0b14" stroke="#22d3ee" strokeWidth={2.5} />
          </>
        )}
        {data.map((d, i) =>
          i % step === 0 || i === data.length - 1 ? (
            <text key={i} x={pts[i].x} y={H - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fill="#8b8ca8" fontSize="12">
              {d.label}
            </text>
          ) : null,
        )}
        {data.map((_, i) => (
          <rect
            key={'h' + i}
            x={pts[i].x - (W / data.length) / 2}
            y={0}
            width={W / data.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>}
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(pts[hover].x / W) * 100}%`, top: `${(pts[hover].y / H) * 100}%`, marginTop: -10 }}
        >
          <div className="text-muted">{data[hover].label}</div>
          <div className="font-semibold">{brl(data[hover].value)}</div>
        </div>
      )}
      <div className="pointer-events-none absolute right-0 top-0 text-[11px] text-muted">{brlShort(max / 1.15)}</div>
    </div>
  )
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

/** Barras que "crescem" ao carregar. */
export function Bars({ data, delay = 300 }: { data: { label: string; value: number; color?: string }[]; delay?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="truncate text-[10px] text-muted">{brlShort(d.value)}</div>
          <div className="flex h-[104px] w-full items-end">
            <div
              className={`grow w-full rounded-t-md ${d.color ?? 'bg-gradient-to-t from-brand to-brand-2'}`}
              style={{ height: Math.max(3, (d.value / max) * 104), '--d': `${delay + i * 80}ms` } as CSSProperties}
            />
          </div>
          <div className="max-w-full truncate text-[10px] text-muted">{d.label}</div>
        </div>
      ))}
    </div>
  )
}
