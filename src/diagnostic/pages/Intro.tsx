import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { BandDot, Margin } from '../components/Parts'
import { Radar } from '../components/Radar'
import { useDiagnostic } from '../context'
import { BAND_LABEL, BAND_RANGE } from '../engine/content'
import type { Band } from '../engine/types'
import { store } from '../lib/storage'
import { useTitle } from '../lib/useTitle'

const RECEIVE = [
  'Uma nota geral de maturidade da gestão, de 0 a 100.',
  'A leitura das cinco dimensões: financeira, atendimento, comercial, operação e indicadores.',
  'Os três pontos que mais merecem atenção, com o motivo de cada um.',
  'As lacunas de informação: o que você ainda não sabe sobre a própria clínica.',
  'Um plano inicial para agora, para os próximos 30 dias e para os próximos 90.',
  'O relatório em PDF, para guardar e comparar com um novo diagnóstico.',
]

const BANDS: Band[] = ['critical', 'attention', 'developing', 'established']

export default function Intro() {
  useTitle('Raio-X da Gestão da Clínica')
  const nav = useNavigate()
  const { inProgress, answeredCount, firstUnanswered, restart, open } = useDiagnostic()
  const last = store.history().at(-1)
  const resuming = inProgress && answeredCount > 0

  return (
    <>
      <header className="rx-wrap rx-top">
        <Link to="/diagnostico" aria-label="SCALABLE">
          <Logo />
        </Link>
        <Link className="rx-link" to="/">
          Já tenho conta
        </Link>
      </header>

      <main>
        <section className="rx-wrap rx-hero">
          <div className="rx-hero__copy">
            <p className="rx-eyebrow rx-in" style={{ '--i': 0 } as never}>Raio-X da Gestão da Clínica</p>
            <h1 className="rx-h1 rx-in" style={{ '--i': 1 } as never}>Sua clínica está tão organizada quanto você imagina?</h1>
            <p className="rx-lede rx-in" style={{ '--i': 2 } as never}>
              Responda a algumas perguntas sobre a gestão da sua clínica e descubra o que está funcionando, onde existem oportunidades de melhoria e o que merece sua atenção.
            </p>
            <div className="rx-actions rx-in" style={{ '--i': 3 } as never}>
              {resuming ? (
                <>
                  <button className="rx-btn rx-btn--primary" onClick={() => nav(`/diagnostico/pergunta/${Math.min(firstUnanswered, 25)}`)}>
                    Continuar o diagnóstico
                  </button>
                  <button
                    className="rx-btn rx-btn--quiet"
                    onClick={() => {
                      restart()
                      nav('/diagnostico/identificacao')
                    }}
                  >
                    Começar de novo
                  </button>
                </>
              ) : (
                <>
                  <button className="rx-btn rx-btn--primary" onClick={() => nav('/diagnostico/identificacao')}>
                    Fazer meu diagnóstico
                  </button>
                  {last && (
                    <button
                      className="rx-btn rx-btn--ghost"
                      onClick={() => {
                        open(last.token)
                        nav('/diagnostico/resultado')
                      }}
                    >
                      Ver meu último resultado
                    </button>
                  )}
                </>
              )}
            </div>
            {resuming && (
              <p className="rx-note rx-in" style={{ '--i': 4 } as never}>
                Você respondeu {answeredCount} de 25 perguntas neste navegador.
              </p>
            )}
            <ul className="rx-facts rx-in" style={{ '--i': 4 } as never}>
              <li>Gratuito</li>
              <li>25 perguntas</li>
              <li>Aproximadamente 5 minutos</li>
              <li>Resultado personalizado</li>
            </ul>
          </div>

          <figure className="rx-film" aria-label="Escala de leitura do diagnóstico">
            <Radar animate scan="once" />
            <Margin at="tl">RX · 5 dimensões · 25 perguntas</Margin>
            <Margin at="br">escala 0–15</Margin>
            <figcaption className="rx-legend">
              {BANDS.map((b) => (
                <span key={b}>
                  <BandDot band={b} />
                  {BAND_LABEL[b]} <span className="rx-mono">{BAND_RANGE[b].replace(' a ', '–')}</span>
                </span>
              ))}
            </figcaption>
          </figure>
        </section>

        <section className="rx-wrap rx-split">
          <div>
            <p className="rx-label">O que você recebe</p>
            <h2 className="rx-h2">Seis entregas, todas baseadas nas suas respostas</h2>
          </div>
          <ol className="rx-index">
            {RECEIVE.map((t, i) => (
              <li key={t}>
                <span className="rx-mono">{String(i + 1).padStart(2, '0')}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rx-wrap rx-split">
          <div>
            <p className="rx-label">Como lemos as respostas</p>
            <h2 className="rx-h2">Cada pergunta tem quatro níveis, e "não sei" também é resposta</h2>
          </div>
          <div className="rx-scale">
            <ol>
              <li><span className="rx-mono">0</span> Não existe esse processo</li>
              <li><span className="rx-mono">1</span> Existe informalmente, sem organização consistente</li>
              <li><span className="rx-mono">2</span> Existe, mas ainda precisa melhorar</li>
              <li><span className="rx-mono">3</span> É organizado e acompanhado regularmente</li>
            </ol>
            <p>
              A opção "Não sei / Não tenho essa informação" <strong>não conta como nota zero</strong>. Ela entra no relatório como lacuna de informação, e a nota considera só o que você soube responder.
            </p>
          </div>
        </section>
      </main>

      <footer className="rx-wrap rx-foot">
        <span>SCALABLE</span>
        <span>O relatório é gerado por regras fixas, a partir das suas respostas, e não substitui uma consultoria.</span>
      </footer>
    </>
  )
}
