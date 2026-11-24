import { useCallback, useEffect, useRef } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Ruler } from '../components/Parts'
import { useDiagnostic, type SyncState } from '../context'
import { DIMENSIONS, DIMENSION_BY_ID, LEVELS, QUESTIONS, QUESTIONS_BY_DIM, UNKNOWN_LABEL } from '../data/questions'
import type { Answer } from '../engine/types'
import { pad2 } from '../lib/format'
import { useTitle } from '../lib/useTitle'

const SYNC_TEXT: Record<SyncState, string> = {
  idle: 'Salvamento automático',
  saving: 'Salvando…',
  saved: 'Respostas salvas',
  offline: 'Sem conexão: guardado neste navegador',
}

export default function Quiz() {
  const { n: param } = useParams()
  const nav = useNavigate()
  const { inProgress, answers, setAnswer, firstUnanswered, answeredCount, sync } = useDiagnostic()
  const n = Number(param)
  const valid = Number.isInteger(n) && n >= 1 && n <= 25
  const q = valid ? QUESTIONS[n - 1] : null
  const timer = useRef<number | undefined>(undefined)
  useTitle(q ? `Pergunta ${n} de 25` : 'Perguntas')

  const go = useCallback((to: number) => nav(`/pergunta/${to}`), [nav])
  const current: Answer | undefined = q ? answers[q.id] : undefined
  const isLast = n === 25

  const choose = useCallback(
    (value: Answer) => {
      if (!q) return
      setAnswer(q.id, value)
      window.clearTimeout(timer.current)
      // Avança sozinho, num instante em que ainda dá para ver a escolha; na última pergunta o usuário confirma.
      if (n < 25) timer.current = window.setTimeout(() => go(n + 1), 380)
    },
    [go, n, q, setAnswer],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => window.clearTimeout(timer.current), [n])

  // Atalhos: 1–4 escolhem o nível, 5 ou N marcam "não sei", setas e Enter navegam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key >= '1' && e.key <= '4') choose(LEVELS[Number(e.key) - 1].level)
      else if (e.key === '5' || e.key.toLowerCase() === 'n') choose(null)
      else if (e.key === 'ArrowLeft' && n > 1) go(n - 1)
      else if ((e.key === 'ArrowRight' || e.key === 'Enter') && current !== undefined && !isLast) go(n + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, current, go, isLast, n])

  if (!inProgress) return <Navigate to="/identificacao" replace />
  if (!q) return <Navigate to={`/pergunta/${Math.min(firstUnanswered, 25)}`} replace />
  // Não dá para pular perguntas: só as respondidas e a próxima.
  if (n > firstUnanswered) return <Navigate to={`/pergunta/${Math.min(firstUnanswered, 25)}`} replace />

  const dim = DIMENSION_BY_ID[q.dim]
  const within = QUESTIONS_BY_DIM[q.dim].filter((x) => answers[x.id] !== undefined).length

  return (
    <div className="rx-quiz">
      <header className="rx-wrap rx-top">
        <Link to="/" aria-label="Sair do questionário (o progresso fica salvo)">
          <Logo />
        </Link>
        <span className={`rx-sync rx-sync--${sync}`} role="status" aria-live="polite">
          <span className="rx-sync__dot" aria-hidden="true" />
          {SYNC_TEXT[sync]}
        </span>
      </header>

      <div className="rx-wrap rx-quiz__grid">
        <aside className="rx-rail" aria-label="Dimensões">
          <p className="rx-label">Dimensões</p>
          <ol>
            {DIMENSIONS.map((d) => {
              const done = QUESTIONS_BY_DIM[d.id].filter((x) => answers[x.id] !== undefined).length
              return (
                <li key={d.id} className={`${d.id === q.dim ? 'is-current' : ''} ${done === 5 ? 'is-done' : ''}`}>
                  <span className="rx-mono rx-rail__n">{done === 5 ? <Check size={14} strokeWidth={1.75} aria-label="completa" /> : d.number}</span>
                  <span className="rx-rail__name">{d.name}</span>
                  <span className="rx-mono rx-rail__count">{done}/5</span>
                </li>
              )
            })}
          </ol>
        </aside>

        <main className="rx-quiz__main">
          <Ruler answers={answers} current={n} reach={firstUnanswered} onGo={go} />

          <div className="rx-qhead">
            <p className="rx-eyebrow">
              Dimensão {dim.number} de 5 <span aria-hidden="true">·</span> {dim.name}
            </p>
            <p className="rx-mono rx-qcount" aria-label={`Pergunta ${n} de 25`}>
              {pad2(n)} <span>/ 25</span>
            </p>
          </div>

          <div key={q.id} className="rx-qbody">
            {q.n === 1 && <p className="rx-blurb">{dim.blurb}</p>}
            <h1 className="rx-question" id="rx-q">
              {q.text}
            </h1>
            <p className="rx-hint">{q.hint}</p>

            <div className="rx-opts" role="radiogroup" aria-labelledby="rx-q">
              {LEVELS.map((l, i) => (
                <button
                  key={l.level}
                  type="button"
                  role="radio"
                  aria-checked={current === l.level}
                  className={`rx-opt ${current === l.level ? 'is-on' : ''}`}
                  onClick={() => choose(l.level)}
                >
                  <kbd className="rx-key">{i + 1}</kbd>
                  <span className="rx-opt__label">{l.label}</span>
                  <span className="rx-meter" aria-hidden="true">
                    {[1, 2, 3].map((k) => (
                      <i key={k} className={k <= l.level ? 'is-fill' : ''} />
                    ))}
                  </span>
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={current === null}
                className={`rx-opt rx-opt--unknown ${current === null ? 'is-on' : ''}`}
                onClick={() => choose(null)}
              >
                <kbd className="rx-key">5</kbd>
                <span className="rx-opt__label">
                  {UNKNOWN_LABEL}
                  <span className="rx-opt__help">Entra no relatório como lacuna de informação, e não como nota zero.</span>
                </span>
              </button>
            </div>
          </div>

          <div className="rx-qnav">
            {n > 1 ? (
              <button className="rx-btn rx-btn--quiet" onClick={() => go(n - 1)}>
                Voltar
              </button>
            ) : (
              <span />
            )}
            <span className="rx-mono rx-qmeta">
              {within} de 5 nesta dimensão · {answeredCount} de 25 no total
            </span>
            {isLast ? (
              <button className="rx-btn rx-btn--primary" disabled={current === undefined} onClick={() => nav('/analise')}>
                Ver meu diagnóstico
              </button>
            ) : (
              <button className="rx-btn rx-btn--ghost" disabled={current === undefined} onClick={() => go(n + 1)}>
                Avançar
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
