import { useState, type FormEvent } from 'react'
import { CheckCircle2, Globe, RefreshCw, XCircle } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { SiteAnalysis } from '../lib/types'
import { fmtDate } from '../lib/format'
import { Field, PageHeader, Reveal, Spinner } from '../components/ui'

const LABELS: Record<string, string> = {
  https: 'Site seguro (HTTPS)',
  titulo: 'Título da página',
  meta_descricao: 'Descrição para o Google',
  responsivo_mobile: 'Adaptado para celular',
  h1: 'Título principal (H1)',
  link_whatsapp: 'Botão de WhatsApp',
  link_instagram: 'Link para o Instagram',
  pixel_ou_analytics: 'Analytics / Pixel',
  imagens_com_alt: 'Imagens com descrição',
  carregamento_rapido: 'Carregamento rápido',
}

export default function Settings() {
  const { company, reloadCompany, toast, session } = useApp()
  const [f, setF] = useState({
    name: company?.name ?? '',
    segment: company?.segment ?? '',
    description: company?.description ?? '',
    website: company?.website ?? '',
    instagram: company?.instagram ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const a = company?.site_analysis as SiteAnalysis | null

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('companies')
      .update({ ...f, instagram: f.instagram ? '@' + f.instagram.replace(/^@/, '') : null, website: f.website || null })
      .eq('id', company!.id)
    setBusy(false)
    if (error) return toast(error.message, 'err')
    await reloadCompany()
    toast('Dados salvos')
  }

  async function analyze() {
    if (!f.website) return toast('Informe o endereço do site', 'err')
    setAnalyzing(true)
    try {
      await api('site', { url: f.website })
      await reloadCompany()
      toast('Análise do site concluída!')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Dados da empresa usados pelos agentes." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal i={1} className="card p-5">
          <form onSubmit={save} className="space-y-3">
            <Field label="Nome da empresa">
              <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Segmento">
              <input className="input" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} />
            </Field>
            <Field label="Sobre o negócio (produtos, preços, horários, entrega…)">
              <textarea className="input min-h-28" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Site">
                <input className="input" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="minhaloja.com.br" />
              </Field>
              <Field label="Instagram">
                <input className="input" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@minhaloja" />
              </Field>
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} Salvar
            </button>
          </form>
          <p className="mt-4 text-xs text-muted">Conta: {session?.user.email}</p>
        </Reveal>

        <Reveal i={2} className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <Globe size={18} /> Análise do site pela IA
            </h2>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Spinner size={12} /> : <RefreshCw size={14} />} {a ? 'Analisar de novo' : 'Analisar site'}
            </button>
          </div>
          {analyzing && <p className="mb-3 text-sm text-muted">A IA está entrando no seu site e avaliando tudo…</p>}
          {!a ? (
            <p className="text-sm text-muted">Informe o site e clique em “Analisar site”. A IA entra nele, avalia e explica o que melhorar.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#262741" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke={a.score >= 70 ? '#34d399' : a.score >= 50 ? '#fbbf24' : '#fb7185'}
                      strokeWidth="3"
                      strokeLinecap="round"
                      className="draw"
                      style={{ '--len': 100, strokeDasharray: `${a.score} 100` } as React.CSSProperties}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{a.score}</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{a.business}</div>
                  <div className="truncate text-xs text-muted">
                    {a.analyzed_url} · {fmtDate(company?.site_analyzed_at ?? null)}
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">{a.summary}</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {Object.entries(a.checks).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    {v ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-rose-600" />}
                    {LABELS[k] ?? k}
                  </div>
                ))}
              </div>
              {a.improvements?.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-amber-600">O que melhorar</div>
                  <ul className="space-y-1 text-sm">
                    {a.improvements.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {a.strengths?.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold text-emerald-600">Pontos fortes</div>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {a.strengths.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Reveal>
      </div>
    </div>
  )
}
