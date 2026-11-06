import { useState, type FormEvent } from 'react'
import { CheckCircle2, Globe, RefreshCw, XCircle } from 'lucide-react'
import { AGENT_NAME } from '../lib/areas'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { SiteAnalysis } from '../lib/types'
import { fmtDate } from '../lib/format'
import { AgentMark, Field, PageHeader, Reveal, Spinner } from '../components/ui'

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
  const [ag, setAg] = useState({
    agent_instructions: company?.agent_instructions ?? '',
    agent_whatsapp: company?.agent_whatsapp ?? true,
    agent_auto_reply: company?.agent_auto_reply ?? true,
  })
  const [savingAg, setSavingAg] = useState(false)
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

  async function saveAgent(e: FormEvent) {
    e.preventDefault()
    setSavingAg(true)
    const { error } = await supabase
      .from('companies')
      .update({ ...ag, agent_instructions: ag.agent_instructions.trim() || null })
      .eq('id', company!.id)
    setSavingAg(false)
    if (error) return toast(error.message, 'err')
    await reloadCompany()
    toast('Configurações do agente salvas')
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
      <PageHeader title="Configurações" subtitle="Dados da empresa e configurações do Agente SCALABLE." />
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
          <form onSubmit={saveAgent} className="space-y-4">
            <div className="flex items-center gap-3">
              <AgentMark size={40} />
              <div>
                <h2 className="font-semibold">{AGENT_NAME}</h2>
                <p className="text-xs text-muted">
                  Um único agente para vendas, marketing, financeiro, atendimento e gestão.
                  {company?.agent_last_run_at ? ` Última análise: ${fmtDate(company.agent_last_run_at)}.` : ''}
                </p>
              </div>
            </div>
            <Field label="Instruções para o agente (tom de voz, regras, o que evitar…)">
              <textarea
                className="input min-h-28"
                value={ag.agent_instructions}
                onChange={(e) => setAg({ ...ag, agent_instructions: e.target.value })}
                placeholder="Ex.: Fale de forma próxima e use “você”. Nunca ofereça desconto acima de 10%. Entregamos só na capital."
              />
            </Field>
            <Toggle
              checked={ag.agent_whatsapp}
              onChange={(v) => setAg({ ...ag, agent_whatsapp: v })}
              title="Atender clientes no WhatsApp"
              text="O agente lê as mensagens recebidas e prepara as respostas."
            />
            <Toggle
              checked={ag.agent_auto_reply}
              disabled={!ag.agent_whatsapp}
              onChange={(v) => setAg({ ...ag, agent_auto_reply: v })}
              title="Responder sozinho dúvidas simples"
              text="Desligado: toda resposta vai para a Central de Aprovações antes de ser enviada. Pedidos de desconto, reclamações e assuntos sensíveis sempre pedem sua aprovação."
            />
            <button className="btn-primary w-full" disabled={savingAg}>
              {savingAg && <Spinner />} Salvar configurações do agente
            </button>
          </form>
        </Reveal>

        <Reveal i={3} className="card p-5 lg:col-span-2">
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
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eef0f3" strokeWidth="3" />
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

function Toggle({ checked, onChange, title, text, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl bg-panel-2 p-3 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand ${checked ? 'bg-brand' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </label>
  )
}
