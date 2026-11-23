import type { ReactNode } from 'react'
import { DIMENSIONS, QUESTIONS_BY_DIM } from '../data/questions'
import type { Answers, Band } from '../engine/types'
import { BAND_LABEL } from '../engine/content'

/** Ponto de status de uma faixa de maturidade. A cor significa a faixa; nunca é decoração. */
export function BandDot({ band }: { band: Band | null }) {
  return <span className={`rx-dot rx-dot--${band ?? 'none'}`} aria-hidden="true" />
}

export function BandTag({ band, label }: { band: Band | null; label?: string }) {
  return (
    <span className="rx-bandtag">
      <BandDot band={band} />
      {label ?? (band ? BAND_LABEL[band] : 'Sem informação suficiente')}
    </span>
  )
}

/** Anotação de margem de chapa: texto mono pequeno, fixo no canto de um painel. Assinatura do produto. */
export function Margin({ at, children }: { at: 'tl' | 'tr' | 'bl' | 'br'; children: ReactNode }) {
  return <span className={`rx-margin rx-margin--${at}`}>{children}</span>
}

/** Régua de progresso: 25 marcas agrupadas por dimensão, como a escala de uma chapa. */
export function Ruler({ answers, current, onGo, reach }: { answers: Answers; current: number; onGo?: (n: number) => void; reach: number }) {
  return (
    <div className="rx-ruler" role="group" aria-label="Progresso do diagnóstico">
      {DIMENSIONS.map((d, di) => (
        <div key={d.id} className="rx-ruler__group">
          <div className="rx-ruler__ticks">
            {QUESTIONS_BY_DIM[d.id].map((q, qi) => {
              const idx = di * 5 + qi + 1
              const done = answers[q.id] !== undefined
              const isCurrent = idx === current
              const reachable = idx <= reach
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`rx-tick ${done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}
                  disabled={!reachable || !onGo}
                  onClick={() => onGo?.(idx)}
                  aria-label={`Pergunta ${idx}${done ? ', respondida' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                />
              )
            })}
          </div>
          <span className="rx-ruler__label">{d.short}</span>
        </div>
      ))}
    </div>
  )
}
