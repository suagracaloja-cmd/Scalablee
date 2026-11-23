import { DIMENSIONS } from '../data/questions'

/**
 * Mapa de maturidade: cinco eixos, anéis nas fronteiras das faixas (4, 8, 12 e 15 de 15).
 * Sem valores, é o instrumento em branco (apresentação e tela de análise). Com valores, o único elemento colorido
 * é o polígono das notas; a malha fica em tons neutros.
 */

const W = 560
const H = 540
const CX = 280
const CY = 266
const R = 184
const RINGS = [4, 8, 12, 15]

const angle = (i: number) => ((-90 + 72 * i) * Math.PI) / 180
const point = (i: number, r: number) => [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))] as const
const fmt = (n: number) => n.toFixed(1)

export interface RadarProps {
  /** Notas 0–15 na ordem das cinco dimensões; `null` = sem informação suficiente. */
  values?: (number | null)[]
  /** Entrada única: os anéis e o polígono se abrem uma vez. */
  animate?: boolean
  /** Linha de varredura: 'once' passa uma vez, 'loop' repete (só na tela de análise). */
  scan?: 'once' | 'loop'
  /** Destaca o eixo com uma etiqueta ativa (usado na análise, em sequência). */
  activeAxis?: number
  className?: string
  label?: string
}

export function Radar({ values, animate, scan, activeAxis, className = '', label }: RadarProps) {
  const dims = DIMENSIONS
  const poly = values
    ? values.map((v, i) => point(i, ((v ?? 0) / 15) * R)).map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')
    : null
  const aria =
    label ??
    (values
      ? `Mapa de maturidade: ${dims.map((d, i) => `${d.short} ${values[i] === null ? 'sem informação suficiente' : `${String(values[i]).replace('.', ',')} de 15`}`).join('; ')}.`
      : 'Instrumento de leitura com cinco dimensões da gestão e escala de 0 a 15.')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`rx-radar ${animate ? 'rx-radar--in' : ''} ${className}`} role="img" aria-label={aria}>
      {/* anéis das faixas */}
      {RINGS.map((v, k) => (
        <polygon
          key={v}
          className="rx-radar__ring"
          style={{ animationDelay: `${k * 90}ms` }}
          points={dims.map((_, i) => point(i, (v / 15) * R)).map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}
        />
      ))}
      {/* eixos */}
      {dims.map((_, i) => {
        const [x, y] = point(i, R)
        return <line key={i} className="rx-radar__axis" x1={CX} y1={CY} x2={fmt(x)} y2={fmt(y)} />
      })}
      {/* escala, ao longo do raio livre de baixo */}
      {RINGS.map((v) => (
        <text key={v} className="rx-radar__tick" x={CX + 6} y={CY + (v / 15) * R + 4}>
          {v}
        </text>
      ))}
      {/* notas */}
      {poly && <polygon className="rx-radar__poly" points={poly} />}
      {values?.map((v, i) => {
        const [x, y] = point(i, ((v ?? 0) / 15) * R)
        return v === null ? (
          <circle key={i} className="rx-radar__hollow" cx={CX} cy={CY} r={5} />
        ) : (
          <circle key={i} className="rx-radar__dot" cx={fmt(x)} cy={fmt(y)} r={4.5} />
        )
      })}
      {/* rótulos dos eixos */}
      {dims.map((d, i) => {
        const [x, y] = point(i, R + 26)
        const c = Math.cos(angle(i))
        const s = Math.sin(angle(i))
        return (
          <text
            key={d.id}
            className={`rx-radar__lbl ${activeAxis === i ? 'is-active' : ''}`}
            x={fmt(x)}
            y={fmt(y + (s > 0.5 ? 12 : s < -0.5 ? -2 : 4))}
            textAnchor={c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'}
          >
            {d.short}
          </text>
        )
      })}
      {scan && <line className={`rx-radar__scan rx-radar__scan--${scan}`} x1={0} x2={W} y1={0} y2={0} />}
    </svg>
  )
}
