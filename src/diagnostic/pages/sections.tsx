import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, Minus } from 'lucide-react'
import { BandDot, BandTag, Margin } from '../components/Parts'
import { Radar } from '../components/Radar'
import { CAPABILITIES } from '../data/capabilities'
import { DIMENSIONS, DIMENSION_BY_ID, QUESTION_BY_ID } from '../data/questions'
import { BAND_LABEL, BAND_RANGE, TEAM_LABEL } from '../engine/content'
import { fmtScore, isLowConfidence } from '../engine/score'
import type { DimensionAnalysis, Report } from '../engine/types'
import { fmtDate, shortId } from '../lib/format'
import { SIGNUP_PATH, trackEvent } from '../lib/events'
import type { HistoryItem } from '../lib/storage'

export function Section({ id, n, label, title, children }: { id: string; n: string; label: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rx-wrap rx-sec" aria-labelledby={`${id}-h`}>
      <div className="rx-sec__side">
        <p className="rx-label">
          <span className="rx-mono">{n}</span> {label}
        </p>
      </div>
      <div className="rx-sec__body">
        <h2 className="rx-h2" id={`${id}-h`}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- A. Visão geral */
export function Overview({ r }: { r: Report }) {
  const s = r.scores
  const noScore = s.overall100 === null
  return (
    <section id="visao-geral" className="rx-wrap rx-overview" aria-label="Visão geral">
      <div className="rx-overview__main">
        <p className="rx-mono rx-meta">
          RX-{shortId(r.generatedAt + r.profile.clinic)} <span aria-hidden="true">·</span> {fmtDate(r.generatedAt)}
        </p>
        <h1 className="rx-h1 rx-h1--md">{r.profile.clinic}</h1>
        <p className="rx-sub">
          {[r.profile.specialty, TEAM_LABEL[r.profile.team], r.profile.name].filter(Boolean).join(' · ')}
        </p>

        <div className="rx-score">
          <div className="rx-score__num rx-num" aria-label={noScore ? 'Sem nota' : `Nota geral ${s.overall100} de 100`}>
            {noScore ? '–' : s.overall100}
            <span>/100</span>
          </div>
          <div className="rx-score__meta">
            <BandTag band={s.band} label={s.band ? BAND_LABEL[s.band] : 'Sem informação suficiente'} />
            <p>
              Baseada em {s.valid} de 25 respostas, {s.knownPct}% das informações conhecidas
              {s.overallRaw !== null && <> · {s.overallRaw} de 75 pontos</>}
            </p>
            {s.unknown > 0 && (
              <p className="rx-muted">
                {s.unknown} {s.unknown === 1 ? 'resposta foi' : 'respostas foram'} "não sei" ({s.unknownPct}%): lacuna de informação, não nota zero.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rx-overview__read">
        {r.overview.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {r.overview.strengths.length > 0 && (
          <div className="rx-works">
            <p className="rx-label">O que já funciona</p>
            <ul>
              {r.overview.strengths.map((t) => (
                <li key={t}>
                  <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- B. Mapa de maturidade */
export function MapSection({ r }: { r: Report }) {
  const dims = DIMENSIONS.map((d) => r.scores.dims[d.id])
  const scored = dims.filter((d) => d.score15 !== null).sort((a, b) => (b.score15 as number) - (a.score15 as number))
  const best = scored.length > 1 ? scored[0].id : null
  const worst = scored.length > 1 ? scored[scored.length - 1].id : null
  const order = [...dims].sort((a, b) => (b.score15 ?? -1) - (a.score15 ?? -1))
  return (
    <Section id="mapa" n="02" label="Mapa de maturidade" title="Onde a gestão está mais firme e onde está mais frágil">
      <div className="rx-map">
        <figure className="rx-film rx-film--map">
          <Radar values={dims.map((d) => d.score15)} animate />
          <Margin at="tl">
            RX-{shortId(r.generatedAt + r.profile.clinic)} · {fmtDate(r.generatedAt)}
          </Margin>
          <Margin at="br">escala 0–15</Margin>
        </figure>

        <div className="rx-rank">
          <ol>
            {order.map((d) => {
              const dim = DIMENSION_BY_ID[d.id]
              return (
                <li key={d.id}>
                  <div className="rx-rank__row">
                    <span className="rx-rank__name">{dim.name}</span>
                    <span className="rx-rank__score rx-num">
                      {fmtScore(d.score15)}
                      <small>/15</small>
                    </span>
                  </div>
                  <div className={`rx-bar ${d.id === worst ? 'rx-bar--focus' : ''}`} aria-hidden="true">
                    <i style={{ width: `${((d.score15 ?? 0) / 15) * 100}%` }} />
                  </div>
                  <div className="rx-rank__foot">
                    <BandTag band={d.band} />
                    {d.id === best && <span className="rx-mono rx-tagline">ponto mais forte</span>}
                    {d.id === worst && <span className="rx-mono rx-tagline">ponto mais frágil</span>}
                    {d.unknown > 0 && <span className="rx-mono rx-tagline">{d.unknown} sem informação</span>}
                  </div>
                </li>
              )
            })}
          </ol>
          <ul className="rx-legend rx-legend--stack">
            {(['critical', 'attention', 'developing', 'established'] as const).map((b) => (
              <li key={b}>
                <BandDot band={b} />
                {BAND_LABEL[b]} <span className="rx-mono">{BAND_RANGE[b].replace(' a ', '–')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {r.patterns.length > 0 && (
        <div className="rx-patterns">
          <p className="rx-label">O que o cruzamento das suas respostas mostra</p>
          <ul>
            {r.patterns.map((p) => (
              <li key={p.id}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

/* ---------------------------------------------------------------- C. Análise por dimensão */
const PRIO_LABEL: Record<DimensionAnalysis['priorityLevel'], string> = {
  alta: 'Prioridade alta',
  media: 'Prioridade média',
  manter: 'Manter e acompanhar',
  investigar: 'Descobrir antes de melhorar',
}

export function DimensionsSection({ r }: { r: Report }) {
  return (
    <Section id="dimensoes" n="03" label="Análise por dimensão" title="O que as respostas revelam em cada área">
      <div className="rx-dims">
        {r.dimensions.map((a) => {
          const dim = DIMENSION_BY_ID[a.id]
          const s = a.score
          return (
            <article key={a.id} id={`dim-${a.id}`} className="rx-dim">
              <header className="rx-dim__head">
                <span className="rx-mono rx-dim__n">{String(dim.number).padStart(2, '0')}</span>
                <h3>{dim.name}</h3>
                <span className="rx-dim__score rx-num">
                  {fmtScore(s.score15)}
                  <small>/15</small>
                </span>
                <BandTag band={s.band} />
              </header>
              <p className="rx-dim__headline">{a.headline}</p>
              {isLowConfidence(s) && <p className="rx-muted">Leitura frágil: só {s.valid} de 5 respostas desta área são válidas.</p>}
              <div className="rx-dim__cols">
                <div>
                  <h4>O que as respostas revelam</h4>
                  <ul>
                    {a.reveals.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>{s.band === 'established' ? 'Para manter o padrão' : 'O que pode acontecer'}</h4>
                  <ul>
                    {a.risks.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>Prioridade</h4>
                  <p className={`rx-prio rx-prio--${a.priorityLevel}`}>{PRIO_LABEL[a.priorityLevel]}</p>
                  {a.priorityTopic && <p className="rx-prio__topic">{a.priorityTopic}</p>}
                  {a.priorityAction && <p>{a.priorityAction}</p>}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- D. Três prioridades */
const MODE_LABEL = { urgent: 'Estruturar', build: 'Dar regularidade', sustain: 'Sustentar', discover: 'Descobrir' } as const

export function PrioritiesSection({ r }: { r: Report }) {
  return (
    <Section id="prioridades" n="04" label="Pontos de atenção" title="Os três pontos que mais merecem a sua atenção">
      <p className="rx-lede rx-lede--tight">
        A ordem não é só a das menores notas. Ela pesa também a importância de cada área, os processos que não existem e as informações que você ainda não tem.
      </p>
      <ol className="rx-prios">
        {r.priorities.map((p) => {
          const dim = DIMENSION_BY_ID[p.dim]
          return (
            <li key={p.dim} className="rx-prios__item">
              <span className="rx-prios__rank rx-mono" aria-label={`Prioridade ${p.rank}`}>
                {p.rank}
              </span>
              <div className="rx-prios__body">
                <div className="rx-prios__top">
                  <h3>{dim.name}</h3>
                  <span className="rx-mono rx-tagline">{MODE_LABEL[p.mode]}</span>
                </div>
                <p className="rx-prios__headline">{p.headline}</p>
                <dl className="rx-prios__why">
                  <dt>Por que merece atenção</dt>
                  <dd>{p.reasons.length ? p.reasons.join(' · ') : 'Esta é a área com mais a ganhar no momento.'}</dd>
                  <dd>{dim.matters}</dd>
                  {p.orderNote && <dd className="rx-prios__order">{p.orderNote}</dd>}
                </dl>
                {p.evidence.length > 0 && (
                  <ul className="rx-prios__evidence">
                    {p.evidence.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
                <a className="rx-link" href={`#dim-${p.dim}`}>
                  Ver a análise completa de {dim.short.toLowerCase()}
                </a>
              </div>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

/* ---------------------------------------------------------------- E. Plano inicial */
export function PlanSection({ r }: { r: Report }) {
  const cols = [
    { key: 'now', title: 'Agora', sub: 'Ações prioritárias', items: r.plan.now },
    { key: 'd30', title: 'Próximos 30 dias', sub: 'Organização dos processos', items: r.plan.d30 },
    { key: 'd90', title: 'Próximos 90 dias', sub: 'Acompanhamento e evolução', items: r.plan.d90 },
  ] as const
  return (
    <Section id="plano" n="05" label="Plano inicial" title="Por onde começar, e o que vem depois">
      <p className="rx-lede rx-lede--tight">{r.plan.intro}</p>
      <div className="rx-plan">
        {cols.map((c) => (
          <div key={c.key} className="rx-plan__col">
            <header>
              <h3>{c.title}</h3>
              <p className="rx-mono">{c.sub}</p>
            </header>
            <ol>
              {c.items.map((i) => (
                <li key={i.text}>
                  <span className="rx-mono rx-tagline">{i.topic}</span>
                  <p>{i.text}</p>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- F. Evolução (comparação) */
export function EvolutionSection({ r, prev }: { r: Report; prev: HistoryItem }) {
  const delta = r.scores.overall100 !== null && prev.overall100 !== null ? r.scores.overall100 - prev.overall100 : null
  return (
    <Section id="evolucao" n="06" label="Evolução" title={`Comparação com o diagnóstico de ${fmtDate(prev.completedAt)}`}>
      <table className="rx-table">
        <thead>
          <tr>
            <th scope="col">Dimensão</th>
            <th scope="col" className="rx-num">Antes</th>
            <th scope="col" className="rx-num">Agora</th>
            <th scope="col" className="rx-num">Variação</th>
          </tr>
        </thead>
        <tbody>
          {DIMENSIONS.map((d) => (
            <DeltaRow key={d.id} name={d.name} before={prev.dims[d.id] ?? null} now={r.scores.dims[d.id].score15} unit="/15" />
          ))}
          <DeltaRow name="Nota geral" before={prev.overall100} now={r.scores.overall100} unit="/100" strong />
        </tbody>
      </table>
      <p className="rx-muted">
        {delta === null
          ? 'Em alguma das duas leituras faltou informação para calcular a nota, então a comparação direta não é possível.'
          : 'A comparação usa as notas de cada diagnóstico. Respostas "não sei" são normalizadas, e por isso conhecer mais informações também muda o resultado.'}
      </p>
    </Section>
  )
}

function DeltaRow({ name, before, now, unit, strong }: { name: string; before: number | null; now: number | null; unit: string; strong?: boolean }) {
  const d = before !== null && now !== null ? Math.round((now - before) * 10) / 10 : null
  const Icon = d === null || d === 0 ? Minus : d > 0 ? ArrowUp : ArrowDown
  return (
    <tr className={strong ? 'is-strong' : ''}>
      <th scope="row">{name}</th>
      <td className="rx-num">{fmtScore(before)}<small>{unit}</small></td>
      <td className="rx-num">{fmtScore(now)}<small>{unit}</small></td>
      <td className="rx-num">
        <span className={`rx-delta ${d === null || d === 0 ? '' : d > 0 ? 'is-up' : 'is-down'}`}>
          <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
          {d === null ? 'sem base' : `${d > 0 ? '+' : ''}${fmtScore(d)}`}
        </span>
      </td>
    </tr>
  )
}

/* ---------------------------------------------------------------- G. O próximo passo */
export function CtaButton({ placement }: { placement: string }) {
  return (
    <Link className="rx-btn rx-btn--primary" to={SIGNUP_PATH} onClick={() => trackEvent('cta_clicked', placement)}>
      Quero organizar a gestão da minha clínica
    </Link>
  )
}

export function NextStepSection({ r }: { r: Report }) {
  const n = r.nextStep
  const byDim = DIMENSIONS.map((d) => ({ dim: d, items: n.connections.filter((c) => c.dim === d.id) })).filter((g) => g.items.length)
  // Ordem das prioridades do relatório.
  byDim.sort((a, b) => r.priorities.findIndex((p) => p.dim === a.dim.id) - r.priorities.findIndex((p) => p.dim === b.dim.id))
  return (
    <Section id="proximo-passo" n="07" label="Próximo passo" title="O próximo passo da sua clínica">
      <div className="rx-next">
        <div className="rx-next__copy">
          {n.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <div className="rx-next__cta">
            <CtaButton placement="next-step-top" />
            <p className="rx-note">Você segue para o cadastro da plataforma, com e-mail e senha.</p>
          </div>
        </div>
        <div className="rx-start">
          <p className="rx-label">Como começar</p>
          <ol>
            {n.start.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="rx-fits">
        <p className="rx-label">Como a SCALABLE se conecta ao que você respondeu</p>
        {byDim.map(({ dim, items }) => (
          <div key={dim.id} className="rx-fits__group">
            <h3>{dim.name}</h3>
            {items.map((c) => {
              const q = QUESTION_BY_ID[c.question]
              return (
                <div key={c.question} className="rx-fit">
                  <div className="rx-fit__found">
                    <p className="rx-mono rx-tagline">O que apareceu</p>
                    <p className="rx-fit__topic">{q.topic}</p>
                    <p className="rx-muted">{c.level === null ? q.reveal.u : q.reveal[c.level]}</p>
                  </div>
                  <div className="rx-fit__says">
                    <p className="rx-mono rx-tagline">Na SCALABLE</p>
                    {c.text ? (
                      <>
                        <p>{c.text}</p>
                        <p className="rx-caps">{c.capabilities.map((id) => CAPABILITIES[id].label).join(' · ')}</p>
                      </>
                    ) : (
                      <p className="rx-muted">Ainda não há um recurso direto para este ponto.</p>
                    )}
                    {c.limits.length > 0 && <p className="rx-limit">Ainda não cobre: {limitShort(c.limits)}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {n.organize.length > 0 && (
        <div className="rx-organize">
          <p className="rx-label">O que a sua clínica poderá organizar na plataforma</p>
          <ul>
            {n.organize.map((id) => {
              const c = CAPABILITIES[id]
              return (
                <li key={id}>
                  <h3>{c.label}</h3>
                  <p>{c.description}</p>
                  {c.setup && <p className="rx-muted">{c.setup}</p>}
                  {c.ai && <p className="rx-muted">{c.ai}</p>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {n.limits.length > 0 && (
        <div className="rx-limits">
          <p className="rx-label">O que continua dependendo do seu processo</p>
          <ul>
            {n.limits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rx-next__end">
        <CtaButton placement="next-step-end" />
      </div>
    </Section>
  )
}

function limitShort(ids: string[]): string {
  const map: Record<string, string> = {
    'sem-agenda': 'agenda de consultas, confirmação e controle de faltas',
    'sem-metas': 'cadastro de metas',
    'sem-equipe': 'usuários separados para a equipe',
    'sem-projecao': 'projeção de caixa e orçamento futuro',
    'sem-reclamacoes': 'registro de reclamações e pesquisa de satisfação',
    'sem-procedimentos': 'roteiros e procedimentos da equipe',
    'sem-reunioes': 'reuniões de gestão',
  }
  return ids.map((i) => map[i] ?? i).join('; ')
}
