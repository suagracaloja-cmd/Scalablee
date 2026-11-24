import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Logo } from '../components/Logo'
import { useDiagnostic } from '../context'
import { trackEvent } from '../lib/events'
import { store } from '../lib/storage'
import { useTitle } from '../lib/useTitle'
import { DimensionsSection, EvolutionSection, MapSection, NextStepSection, Overview, PlanSection, PrioritiesSection } from './sections'

type View = 'loading' | 'ready' | 'none' | 'progress'

const NAV = [
  ['visao-geral', 'Visão geral'],
  ['mapa', 'Mapa'],
  ['dimensoes', 'Dimensões'],
  ['prioridades', 'Prioridades'],
  ['plano', 'Plano'],
  ['proximo-passo', 'Próximo passo'],
] as const

function useActive(ids: readonly string[], enabled: boolean) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const seen = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0]
        if (best && best[1] > 0) setActive(best[0])
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.1, 0.5, 1] },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [enabled, ids])
  return active
}

export default function Result() {
  useTitle('Seu Raio-X da gestão')
  const nav = useNavigate()
  const { report, token, hydrate, erase, firstUnanswered } = useDiagnostic()
  const [fetched, setFetched] = useState<View | null>(null)
  const view: View = report ? 'ready' : (fetched ?? 'loading')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmErase, setConfirmErase] = useState(false)
  const [erasing, setErasing] = useState(false)

  useEffect(() => {
    if (report) return
    let alive = true
    hydrate().then((r) => alive && setFetched(r === 'ok' ? 'ready' : r === 'in_progress' ? 'progress' : 'none'))
    return () => {
      alive = false
    }
  }, [hydrate, report])

  // Registra uma visualização por diagnóstico e por aba.
  useEffect(() => {
    if (view === 'ready' && token && !store.viewed(token)) {
      store.setViewed(token)
      trackEvent('report_viewed')
    }
  }, [view, token])

  const prev = useMemo(() => {
    if (!report) return null
    return store.history().filter((h) => h.token !== token && h.completedAt < report.generatedAt).at(-1) ?? null
  }, [report, token])

  const ids = useMemo(() => (prev ? [...NAV.map((n) => n[0]), 'evolucao'] : NAV.map((n) => n[0])), [prev])
  const active = useActive(ids, view === 'ready')

  if (view === 'none') return <Navigate to="/" replace />
  if (view === 'progress') return <Navigate to={`/pergunta/${Math.min(firstUnanswered, 25)}`} replace />
  if (view === 'loading' || !report)
    return (
      <div className="rx-boot" role="status" aria-label="Carregando o relatório">
        <Logo />
      </div>
    )

  async function pdf() {
    if (!report) return
    setPdfBusy(true)
    setMessage(null)
    try {
      const { downloadReportPdf } = await import('../lib/pdf')
      downloadReportPdf(report, prev)
      trackEvent('pdf_downloaded')
    } catch {
      setMessage('Não foi possível gerar o PDF agora. Tente de novo em instantes.')
    } finally {
      setPdfBusy(false)
    }
  }

  function retake() {
    // Só navega: criar o novo diagnóstico (begin) já reinicia a sessão. Limpar o estado aqui faria esta página,
    // que depende dele, redirecionar para o início antes da navegação terminar.
    trackEvent('retake_started')
    nav('/identificacao')
  }

  async function doErase() {
    setErasing(true)
    setMessage(null)
    try {
      await erase()
      nav('/', { replace: true })
    } catch {
      setErasing(false)
      setMessage('Não foi possível apagar agora. Nada foi removido; tente de novo quando a conexão voltar.')
    }
  }

  return (
    <>
      <header className="rx-wrap rx-top">
        <Link to="/" aria-label="SCALABLE">
          <Logo />
        </Link>
        <div className="rx-top__actions">
          <button className="rx-btn rx-btn--ghost rx-btn--sm" onClick={pdf} disabled={pdfBusy}>
            <Download size={16} strokeWidth={1.5} aria-hidden="true" />
            {pdfBusy ? 'Gerando…' : 'Baixar PDF'}
          </button>
        </div>
      </header>

      <nav className="rx-toc" aria-label="Seções do relatório">
        <div className="rx-wrap">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'is-active' : ''} aria-current={active === id ? 'location' : undefined}>
              {label}
            </a>
          ))}
          {prev && (
            <a href="#evolucao" className={active === 'evolucao' ? 'is-active' : ''}>
              Evolução
            </a>
          )}
        </div>
      </nav>

      <main>
        <Overview r={report} />
        <MapSection r={report} />
        <DimensionsSection r={report} />
        <PrioritiesSection r={report} />
        <PlanSection r={report} />
        {prev && <EvolutionSection r={report} prev={prev} />}
        <NextStepSection r={report} />

        <section className="rx-wrap rx-sec rx-keep" aria-label="Guardar e continuar">
          <div className="rx-sec__side">
            <p className="rx-label">Guardar e continuar</p>
          </div>
          <div className="rx-sec__body">
            <div className="rx-keep__actions">
              <button className="rx-btn rx-btn--ghost" onClick={pdf} disabled={pdfBusy}>
                <Download size={16} strokeWidth={1.5} aria-hidden="true" />
                {pdfBusy ? 'Gerando…' : 'Baixar o relatório em PDF'}
              </button>
              <button className="rx-btn rx-btn--ghost" onClick={retake}>
                Refazer o diagnóstico
              </button>
            </div>
            <p className="rx-muted">
              Para acompanhar a evolução, refaça o Raio-X depois de colocar o plano em prática: a comparação com este resultado aparece no relatório novo. O histórico fica neste navegador, e não há lembretes automáticos.
            </p>
            <p className="rx-muted">
              Este relatório é gerado por regras fixas a partir das suas respostas, não usa inteligência artificial e não substitui uma consultoria. As consequências descritas são possibilidades, e não prejuízos medidos.
            </p>

            <div className="rx-erase">
              {confirmErase ? (
                <>
                  <p>Isso apaga, no servidor e neste navegador, este diagnóstico e os anteriores. Não dá para desfazer.</p>
                  <div className="rx-keep__actions">
                    <button className="rx-btn rx-btn--danger rx-btn--sm" onClick={doErase} disabled={erasing}>
                      {erasing ? 'Apagando…' : 'Apagar tudo'}
                    </button>
                    <button className="rx-btn rx-btn--quiet rx-btn--sm" onClick={() => setConfirmErase(false)} disabled={erasing}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button className="rx-btn rx-btn--quiet rx-btn--sm" onClick={() => setConfirmErase(true)}>
                  Apagar meus dados
                </button>
              )}
            </div>
            {message && (
              <p className="rx-error rx-error--box" role="alert">
                {message}
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="rx-wrap rx-foot">
        <span>SCALABLE</span>
        <span>Raio-X da Gestão da Clínica</span>
      </footer>
    </>
  )
}
