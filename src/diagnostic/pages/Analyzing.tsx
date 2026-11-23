import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Margin } from '../components/Parts'
import { Radar } from '../components/Radar'
import { useDiagnostic } from '../context'
import { DiagError } from '../lib/api'
import { useTitle } from '../lib/useTitle'

const STEPS = [
  'Calculando as cinco dimensões',
  'Cruzando respostas e lacunas de informação',
  'Priorizando os pontos de atenção',
  'Montando o plano de evolução',
]

/** Tempo mínimo na tela, para a transição ser lida; o relatório só aparece depois de gravado de verdade. */
const MIN_MS = 2800

export default function Analyzing() {
  useTitle('Organizando os resultados')
  const nav = useNavigate()
  const { inProgress, report, complete, firstUnanswered } = useDiagnostic()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Depois que esta tela inicia a geração, ela mesma conduz a saída; sem isso, o relatório pronto a faria sumir de imediato.
  const [started, setStarted] = useState(false)
  const running = useRef(false)

  const run = useCallback(() => {
    if (running.current) return
    running.current = true
    setStarted(true)
    setError(null)
    setStep(0)
    const tick = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), MIN_MS / STEPS.length)
    Promise.all([complete(), new Promise((r) => window.setTimeout(r, MIN_MS))])
      .then(() => {
        setStep(STEPS.length)
        window.setTimeout(() => nav('/diagnostico/resultado', { replace: true }), 450)
      })
      .catch((e) => {
        running.current = false
        setError(e instanceof DiagError ? e.message : 'Não foi possível concluir agora.')
      })
      .finally(() => window.clearInterval(tick))
  }, [complete, nav])

  useEffect(() => {
    if (inProgress && firstUnanswered > 25) run()
  }, [firstUnanswered, inProgress, run])

  if (report && !started) return <Navigate to="/diagnostico/resultado" replace />
  if (!started && !inProgress) return <Navigate to="/diagnostico" replace />
  if (!started && firstUnanswered <= 25) return <Navigate to={`/diagnostico/pergunta/${firstUnanswered}`} replace />

  return (
    <div className="rx-analyze">
      <header className="rx-wrap rx-top">
        <Logo />
      </header>
      <main className="rx-wrap rx-analyze__main">
        <figure className="rx-film rx-film--center">
          <Radar scan="loop" activeAxis={Math.min(step, 4)} />
          <Margin at="tl">RX · leitura em andamento</Margin>
          <Margin at="br">{Math.min(step, STEPS.length)}/{STEPS.length}</Margin>
        </figure>
        <div className="rx-analyze__copy">
          <h1 className="rx-h2 rx-h2--lg" role="status">
            Estamos organizando os resultados da sua clínica.
          </h1>
          <ol className="rx-steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
                <span className="rx-steps__mark" aria-hidden="true">
                  {i < step ? <Check size={14} strokeWidth={2} /> : null}
                </span>
                {s}
              </li>
            ))}
          </ol>
          {error && (
            <div className="rx-error rx-error--box" role="alert">
              <p>{error}</p>
              <p>Suas respostas continuam salvas neste navegador.</p>
              <button className="rx-btn rx-btn--ghost rx-btn--sm" onClick={run}>
                Tentar de novo
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
