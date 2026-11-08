import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, Globe, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { AGENT_NAME } from '../lib/areas'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { SiteAnalysis } from '../lib/types'
import { fmtDate } from '../lib/format'
import { AgentMark, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'
import { LEGAL_LINKS } from '../components/LegalFooter'

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
  const [uso, setUso] = useState<{ used: number; limit: number; providers: string[] } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api<{ used: number; limit: number; providers: string[] }>('uso').then(setUso).catch(() => setUso(null))
  }, [])

  /** Portabilidade (LGPD): baixa todos os dados da empresa num arquivo JSON. */
  async function exportData() {
    setExporting(true)
    try {
      const tables = ['customers', 'sales', 'transactions', 'tasks', 'insights', 'approvals', 'agent_threads', 'assistant_messages', 'conversations', 'messages'] as const
      const out: Record<string, unknown> = { exportado_em: new Date().toISOString(), conta: session?.user.email, empresa: company }
      for (const t of tables) {
        const rows: unknown[] = []
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from(t).select('*').range(from, from + 999)
          if (error) throw new Error(`${t}: ${error.message}`)
          rows.push(...(data ?? []))
          if (!data || data.length < 1000) break
        }
        out[t] = rows
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `scalable-dados-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast('Arquivo com seus dados baixado')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setExporting(false)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      await api('conta', { action: 'excluir', confirmacao: delText })
      toast('Conta excluída')
      await supabase.auth.signOut()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
      setDeleting(false)
    }
  }
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
            {uso && (
              <div className="rounded-2xl bg-panel-2 p-3 text-xs text-muted">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    IA em uso: <b className="text-ink">{uso.providers.length ? uso.providers.map((p) => (p === 'groq' ? 'Groq (gratuita)' : 'Claude (Anthropic)')).join(' → ') : 'nenhuma (modo básico)'}</b>
                  </span>
                  {uso.limit > 0 && (
                    <span>
                      Hoje: <b className="text-ink">{uso.used}</b> de {uso.limit} perguntas
                    </span>
                  )}
                </div>
                {uso.limit > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (uso.used / uso.limit) * 100)}%` }} />
                  </div>
                )}
              </div>
            )}
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
        <Reveal i={4} className="card p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck size={18} /> Privacidade e dados
          </h2>
          <p className="mt-1 text-sm text-muted">
            Seus dados pertencem à sua empresa. Baixe uma cópia completa quando quiser ou exclua a conta.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {LEGAL_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="font-medium text-ink underline underline-offset-2">{l.label}</Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button className="btn-ghost" onClick={exportData} disabled={exporting}>
              {exporting ? <Spinner size={14} /> : <Download size={16} />} Exportar meus dados
            </button>
            <button className="btn-danger" onClick={() => (setDelText(''), setDelOpen(true))}>
              <Trash2 size={16} /> Excluir minha conta
            </button>
          </div>
        </Reveal>
      </div>
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Excluir conta">
        <p className="text-sm text-muted">
          Isso apaga <b className="text-ink">definitivamente</b> a sua conta e todos os dados da empresa: vendas, clientes, financeiro, tarefas, conversas, aprovações e a conexão do WhatsApp. Não dá para desfazer. Se quiser, exporte seus dados antes.
        </p>
        <Field label='Para confirmar, digite EXCLUIR'>
          <input className="input" value={delText} onChange={(e) => setDelText(e.target.value)} placeholder="EXCLUIR" />
        </Field>
        <button className="btn-danger mt-3 w-full" disabled={deleting || delText.trim().toUpperCase() !== 'EXCLUIR'} onClick={deleteAccount}>
          {deleting && <Spinner size={14} />} Excluir definitivamente
        </button>
      </Modal>
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
