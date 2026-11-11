import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CalendarDays, ClipboardList, History, Lock, NotebookPen, Pill, Plus, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { STATUS_AGENDA, TIPO_AGENDA } from '../lib/types'
import { fmtDate, today } from '../lib/format'
import { erroProntuario, GESTANTE_LABEL, idadeEm, TIPO_EVOLUCAO_LABEL, TIPOS_EVOLUCAO, type Anamnese, type Evolucao, type GestanteLactante, type ProntuarioDados, type TipoEvolucao } from '../lib/prontuario'
import { Empty, Field, Modal, Reveal, Spinner } from '../components/ui'

type Paciente = { id: string; name: string; phone: string | null; email: string | null; data_nascimento: string | null; status: string }
type ProfissionalLinha = { id: string; nome: string; user_id: string | null }
type Aba = 'evolucao' | 'anamnese' | 'historico'

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const CAMPOS_ANAMNESE: { id: keyof Omit<Anamnese, 'id' | 'gestante_lactante' | 'criado_por_nome' | 'criado_em'>; label: string; dica: string; max: number }[] = [
  { id: 'queixa_principal', label: 'Queixa principal', dica: 'O motivo da consulta, nas palavras do paciente.', max: 3000 },
  { id: 'historico_medico', label: 'Histórico médico', dica: 'Doenças, condições e tratamentos (diabetes, pressão, cardíacos…).', max: 5000 },
  { id: 'medicamentos', label: 'Medicamentos em uso', dica: 'Nome, dose e frequência, se souber.', max: 3000 },
  { id: 'alergias', label: 'Alergias', dica: 'Medicamentos, látex, anestésicos, alimentos…', max: 3000 },
  { id: 'cirurgias_previas', label: 'Cirurgias e internações anteriores', dica: '', max: 3000 },
  { id: 'habitos', label: 'Hábitos', dica: 'Tabagismo, álcool, atividade física, sono…', max: 3000 },
  { id: 'outras_informacoes', label: 'Outras informações', dica: '', max: 5000 },
]

const evVazio = () => ({ tipo: 'consulta' as TipoEvolucao, data_atendimento: today(), titulo: '', descricao: '', conduta: '', profissional_id: '', agendamento_id: '', retifica_id: '' })
type FormEvolucao = ReturnType<typeof evVazio>
const anVazio = (a?: Anamnese | null) => ({
  queixa_principal: a?.queixa_principal ?? '',
  historico_medico: a?.historico_medico ?? '',
  medicamentos: a?.medicamentos ?? '',
  alergias: a?.alergias ?? '',
  cirurgias_previas: a?.cirurgias_previas ?? '',
  habitos: a?.habitos ?? '',
  outras_informacoes: a?.outras_informacoes ?? '',
  gestante_lactante: (a?.gestante_lactante ?? '') as GestanteLactante | '',
})
type FormAnamnese = ReturnType<typeof anVazio>

/** Prontuário do paciente: evolução dos atendimentos, anamnese e histórico. Só dono e profissionais abrem. */
export default function Prontuario() {
  const { id } = useParams()
  const { session, toast } = useApp()
  const [pac, setPac] = useState<Paciente | null>(null)
  const [dados, setDados] = useState<ProntuarioDados | null>(null)
  const [profs, setProfs] = useState<ProfissionalLinha[]>([])
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('evolucao')
  const [formEv, setFormEv] = useState<FormEvolucao | null>(null)
  const [original, setOriginal] = useState<Evolucao | null>(null)
  const [formAn, setFormAn] = useState<FormAnamnese | null>(null)
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    if (!id) return
    const [p, r, pr] = await Promise.all([
      supabase.from('customers').select('id,name,phone,email,data_nascimento,status').eq('id', id).maybeSingle(),
      supabase.rpc('prontuario_abrir', { p_customer: id }),
      supabase.from('profissionais').select('id,nome,user_id').eq('ativo', true).order('nome'),
    ])
    if (r.error) setErro(erroProntuario(r.error.message))
    else if (!p.data) setErro('Paciente não encontrado.')
    else {
      setErro('')
      setPac(p.data as Paciente)
      setDados(r.data as ProntuarioDados)
      setProfs((pr.data ?? []) as ProfissionalLinha[])
    }
    setLoading(false)
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const atual = dados?.anamnese_versoes[0] ?? null
  const nomeProf = useMemo(() => new Map(profs.map((p) => [p.id, p.nome])), [profs])
  const consultaPorId = useMemo(() => new Map((dados?.consultas ?? []).map((c) => [c.id, c])), [dados])

  // Linha do tempo: cada registro com os seus complementos logo abaixo
  const arvore = useMemo(() => {
    const todos = dados?.evolucoes ?? []
    const ids = new Set(todos.map((e) => e.id))
    const filhos = new Map<string, Evolucao[]>()
    for (const e of todos) if (e.retifica_id && ids.has(e.retifica_id)) filhos.set(e.retifica_id, [...(filhos.get(e.retifica_id) ?? []), e])
    for (const l of filhos.values()) l.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    const raizes = todos.filter((e) => !e.retifica_id || !ids.has(e.retifica_id))
    return { raizes, filhos }
  }, [dados])

  function novoRegistro(compl?: Evolucao) {
    const meuProf = profs.find((p) => p.user_id && p.user_id === session?.user.id)
    setOriginal(compl ?? null)
    setFormEv({ ...evVazio(), tipo: compl?.tipo ?? 'consulta', profissional_id: meuProf?.id ?? '', retifica_id: compl?.id ?? '' })
  }

  async function salvarEvolucao(e: FormEvent) {
    e.preventDefault()
    if (!formEv || !id) return
    setBusy(true)
    const { error } = await supabase.rpc('prontuario_registrar_evolucao', {
      p_customer: id,
      p: { ...formEv, profissional_id: formEv.profissional_id || null, agendamento_id: formEv.agendamento_id || null, retifica_id: formEv.retifica_id || null },
    })
    setBusy(false)
    if (error) return toast(erroProntuario(error.message), 'err')
    toast(formEv.retifica_id ? 'Complemento registrado' : 'Registro salvo no prontuário')
    setFormEv(null)
    setOriginal(null)
    carregar()
  }

  async function salvarAnamnese(e: FormEvent) {
    e.preventDefault()
    if (!formAn || !id) return
    setBusy(true)
    const { error } = await supabase.rpc('prontuario_salvar_anamnese', { p_customer: id, p: { ...formAn, gestante_lactante: formAn.gestante_lactante || null } })
    setBusy(false)
    if (error) return toast(erroProntuario(error.message), 'err')
    toast('Anamnese salva (nova versão)')
    setFormAn(null)
    carregar()
  }

  if (loading)
    return (
      <div className="py-16 text-center" role="status" aria-label="Carregando o prontuário">
        <Spinner size={26} />
      </div>
    )
  if (erro || !pac || !dados)
    return (
      <div>
        <Link to="/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft size={15} /> Pacientes
        </Link>
        <Reveal className="card p-6">
          <p className="flex items-start gap-2 text-sm text-rose-700" role="alert">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {erro || 'Não foi possível abrir o prontuário.'}
          </p>
        </Reveal>
      </div>
    )

  const idade = idadeEm(pac.data_nascimento)
  const consultasAbertas = (dados.consultas ?? []).filter((c) => c.status !== 'cancelado').slice(0, 30)

  return (
    <div>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={15} /> Pacientes
      </Link>

      {/* Cabeçalho do paciente, com os alertas que não podem passar batido */}
      <Reveal className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/40 to-brand-2/30 text-lg font-bold" aria-hidden="true">
            {pac.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[22px] font-bold leading-tight sm:text-[26px]">{pac.name}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {[idade !== null ? `${idade} anos` : null, pac.data_nascimento ? `nasc. ${fmtDate(pac.data_nascimento)}` : null, pac.phone ? `+${pac.phone}` : null].filter(Boolean).join(' · ') || 'Sem dados de contato'}
            </p>
          </div>
        </div>
        {atual && (atual.alergias || atual.medicamentos || atual.gestante_lactante === 'gestante' || atual.gestante_lactante === 'lactante') && (
          <ul className="mt-4 flex flex-col gap-2" aria-label="Alertas do paciente">
            {atual.alergias && (
              <li className="flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">
                  <b>Alergias:</b> {atual.alergias}
                </span>
              </li>
            )}
            {(atual.gestante_lactante === 'gestante' || atual.gestante_lactante === 'lactante') && (
              <li className="flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {GESTANTE_LABEL[atual.gestante_lactante]}
              </li>
            )}
            {atual.medicamentos && (
              <li className="flex items-start gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
                <Pill size={16} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">
                  <b>Em uso:</b> {atual.medicamentos}
                </span>
              </li>
            )}
          </ul>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Lock size={14} className="mt-0.5 shrink-0" />
          <span>Dados de saúde são sensíveis. Cada acesso fica registrado, os registros não podem ser alterados nem apagados (para corrigir, use “Complementar”) e a Coraline AI não lê o prontuário.</span>
        </p>
      </Reveal>

      <Reveal i={1} className="mt-4">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Seções do prontuário">
          {(
            [
              { id: 'evolucao', label: `Evolução (${dados.evolucoes.length})`, icon: NotebookPen },
              { id: 'anamnese', label: 'Anamnese', icon: ClipboardList },
              { id: 'historico', label: `Histórico (${dados.consultas.length})`, icon: History },
            ] as const
          ).map((a) => (
            <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${aba === a.id ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:text-ink'}`}>
              <a.icon size={15} /> {a.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Evolução */}
      {aba === 'evolucao' && (
        <section className="mt-4" aria-label="Evolução dos atendimentos">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Evolução dos atendimentos</h2>
            <button className="btn-primary h-10 px-4" onClick={() => novoRegistro()}>
              <Plus size={16} /> Novo registro
            </button>
          </div>
          {arvore.raizes.length === 0 ? (
            <Reveal className="card">
              <Empty icon={<Stethoscope size={24} />} title="Nenhum registro ainda" text="Registre o que foi observado e feito em cada atendimento. Fica salvo na ordem do tempo." action={<button className="btn-primary" onClick={() => novoRegistro()}>Registrar o primeiro atendimento</button>} />
            </Reveal>
          ) : (
            <ul className="space-y-3">
              {arvore.raizes.map((e) => (
                <li key={e.id}>
                  <CartaoEvolucao e={e} profissional={e.profissional_id ? nomeProf.get(e.profissional_id) : undefined} consulta={e.agendamento_id ? consultaPorId.get(e.agendamento_id)?.inicio : undefined} onComplementar={() => novoRegistro(e)} />
                  <Complementos filhos={arvore.filhos} paiId={e.id} nivel={1} nomeProf={nomeProf} onComplementar={novoRegistro} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Anamnese */}
      {aba === 'anamnese' && (
        <section className="mt-4" aria-label="Anamnese">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Anamnese</h2>
            {atual && (
              <button className="btn-primary h-10 px-4" onClick={() => setFormAn(anVazio(atual))}>
                <NotebookPen size={16} /> Atualizar
              </button>
            )}
          </div>
          {!atual ? (
            <Reveal className="card">
              <Empty icon={<ClipboardList size={24} />} title="Anamnese ainda não preenchida" text="A ficha de saúde do paciente: queixa, histórico, medicamentos e alergias." action={<button className="btn-primary" onClick={() => setFormAn(anVazio())}>Preencher anamnese</button>} />
            </Reveal>
          ) : (
            <>
              <Reveal className="card p-5 sm:p-6">
                <p className="mb-4 text-xs text-muted">
                  Versão de {dataHora(atual.criado_em)}, por {atual.criado_por_nome}.
                </p>
                <CamposAnamnese a={atual} />
              </Reveal>
              {dados.anamnese_versoes.length > 1 && (
                <Reveal i={1} className="card mt-3 p-5 sm:p-6">
                  <h3 className="text-sm font-bold">Versões anteriores ({dados.anamnese_versoes.length - 1})</h3>
                  <p className="mt-1 text-xs text-muted">Cada atualização cria uma nova versão. As anteriores continuam guardadas e não podem ser alteradas.</p>
                  <div className="mt-3 divide-y divide-line">
                    {dados.anamnese_versoes.slice(1).map((v) => (
                      <details key={v.id} className="group py-2.5">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
                          <span>{dataHora(v.criado_em)}</span>
                          <span className="text-xs font-normal text-muted">{v.criado_por_nome}</span>
                        </summary>
                        <div className="mt-3">
                          <CamposAnamnese a={v} />
                        </div>
                      </details>
                    ))}
                  </div>
                </Reveal>
              )}
            </>
          )}
        </section>
      )}

      {/* Histórico (consultas da agenda) */}
      {aba === 'historico' && (
        <section className="mt-4" aria-label="Histórico de consultas">
          <h2 className="mb-3 text-lg font-bold">Histórico de consultas</h2>
          {dados.consultas.length === 0 ? (
            <Reveal className="card">
              <Empty icon={<CalendarDays size={24} />} title="Nenhuma consulta na agenda" text="As consultas marcadas para este paciente aparecem aqui." />
            </Reveal>
          ) : (
            <Reveal className="card divide-y divide-line overflow-hidden">
              {dados.consultas.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
                    <CalendarDays size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.servico ?? TIPO_AGENDA[c.tipo]}</div>
                    <div className="truncate text-xs text-muted">
                      {dataHora(c.inicio)}
                      {c.profissional ? ` · ${c.profissional}` : ''}
                    </div>
                  </div>
                  <span className={`chip ${STATUS_AGENDA[c.status].cls}`}>{STATUS_AGENDA[c.status].label}</span>
                </div>
              ))}
            </Reveal>
          )}
        </section>
      )}

      {/* Novo registro / complemento */}
      <Modal open={!!formEv} onClose={() => (setFormEv(null), setOriginal(null))} title={original ? 'Complementar registro' : 'Novo registro de atendimento'} wide>
        {formEv && (
          <form onSubmit={salvarEvolucao} className="space-y-4">
            {original && (
              <div className="rounded-2xl bg-panel-2 p-3 text-xs text-muted">
                Complemento ao registro de <b className="text-ink">{fmtDate(original.data_atendimento)}</b>
                {original.titulo ? ` — ${original.titulo}` : ''}. O registro original não é alterado.
              </div>
            )}
            <Field label="Tipo">
              <div className="flex flex-wrap gap-2">
                {TIPOS_EVOLUCAO.map((t) => (
                  <button type="button" key={t.id} aria-pressed={formEv.tipo === t.id} onClick={() => setFormEv({ ...formEv, tipo: t.id })} className={`h-9 rounded-full px-3.5 text-xs font-semibold ${formEv.tipo === t.id ? 'bg-ink text-white' : 'bg-panel-2'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data do atendimento">
                <input className="input" type="date" required max={today()} value={formEv.data_atendimento} onChange={(e) => setFormEv({ ...formEv, data_atendimento: e.target.value })} />
              </Field>
              <Field label="Título (opcional)">
                <input maxLength={200} className="input" value={formEv.titulo} onChange={(e) => setFormEv({ ...formEv, titulo: e.target.value })} placeholder="Ex.: Restauração do dente 16" />
              </Field>
            </div>
            <Field label="O que foi observado e feito">
              <textarea maxLength={10000} className="input min-h-36" required value={formEv.descricao} onChange={(e) => setFormEv({ ...formEv, descricao: e.target.value })} />
            </Field>
            <Field label="Conduta e orientações (opcional)">
              <textarea maxLength={5000} className="input min-h-24" value={formEv.conduta} onChange={(e) => setFormEv({ ...formEv, conduta: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Profissional (opcional)">
                <select className="input" value={formEv.profissional_id} onChange={(e) => setFormEv({ ...formEv, profissional_id: e.target.value })}>
                  <option value="">Não informado</option>
                  {profs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Field>
              {!original && (
                <Field label="Consulta da agenda (opcional)">
                  <select className="input" value={formEv.agendamento_id} onChange={(e) => setFormEv({ ...formEv, agendamento_id: e.target.value })}>
                    <option value="">Nenhuma</option>
                    {consultasAbertas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {dataHora(c.inicio)} — {c.servico ?? TIPO_AGENDA[c.tipo]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted">Depois de salvo, o registro não pode ser alterado nem apagado. Para corrigir, use “Complementar”.</p>
            <button className="btn-primary w-full" disabled={busy || !formEv.descricao.trim()}>
              {busy && <Spinner />} Salvar no prontuário
            </button>
          </form>
        )}
      </Modal>

      {/* Anamnese */}
      <Modal open={!!formAn} onClose={() => setFormAn(null)} title="Anamnese" wide>
        {formAn && (
          <form onSubmit={salvarAnamnese} className="space-y-4">
            {CAMPOS_ANAMNESE.map((c) => (
              <Field key={c.id} label={c.label}>
                <textarea maxLength={c.max} className="input min-h-20" value={formAn[c.id]} onChange={(e) => setFormAn({ ...formAn, [c.id]: e.target.value })} placeholder={c.dica} />
              </Field>
            ))}
            <Field label="Gestante ou lactante?">
              <select className="input" value={formAn.gestante_lactante} onChange={(e) => setFormAn({ ...formAn, gestante_lactante: e.target.value as GestanteLactante | '' })}>
                <option value="">Não informado</option>
                {Object.entries(GESTANTE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs leading-relaxed text-muted">Ao salvar, é criada uma nova versão. As versões anteriores continuam guardadas.</p>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} Salvar anamnese
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}

function CamposAnamnese({ a }: { a: Anamnese }) {
  const linhas = [...CAMPOS_ANAMNESE.map((c) => ({ label: c.label, valor: a[c.id] })), { label: 'Gestante ou lactante', valor: a.gestante_lactante ? GESTANTE_LABEL[a.gestante_lactante] : null }]
  return (
    <dl className="space-y-3">
      {linhas.map((l) => (
        <div key={l.label}>
          <dt className="text-xs font-semibold text-muted">{l.label}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{l.valor || <span className="text-muted">Não informado</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

function CartaoEvolucao({ e, profissional, consulta, onComplementar, complemento = false }: { e: Evolucao; profissional?: string; consulta?: string; onComplementar: () => void; complemento?: boolean }) {
  return (
    <article className={`card p-4 sm:p-5 ${complemento ? 'border-l-4 border-l-brand' : ''}`}>
      <header className="flex flex-wrap items-center gap-2">
        {complemento && <span className="chip bg-brand-soft text-ink">Complemento</span>}
        <span className="chip bg-panel-2 text-ink">{TIPO_EVOLUCAO_LABEL[e.tipo]}</span>
        <span className="text-sm font-semibold">{fmtDate(e.data_atendimento)}</span>
      </header>
      {e.titulo && <h3 className="mt-2 break-words font-bold">{e.titulo}</h3>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{e.descricao}</p>
      {e.conduta && (
        <div className="mt-3 rounded-2xl bg-panel-2 p-3">
          <p className="text-xs font-semibold text-muted">Conduta e orientações</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{e.conduta}</p>
        </div>
      )}
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0">
          Registrado por {e.criado_por_nome} em {dataHora(e.criado_em)}
          {profissional ? ` · Profissional: ${profissional}` : ''}
          {consulta ? ` · Consulta de ${fmtDate(consulta)}` : ''}
        </span>
        <button className="shrink-0 font-semibold text-brand-dark underline underline-offset-2" onClick={onComplementar}>
          Complementar
        </button>
      </footer>
    </article>
  )
}

function Complementos({ filhos, paiId, nivel, nomeProf, onComplementar }: { filhos: Map<string, Evolucao[]>; paiId: string; nivel: number; nomeProf: Map<string, string>; onComplementar: (e: Evolucao) => void }) {
  const lista = filhos.get(paiId)
  if (!lista?.length) return null
  return (
    <ul className={`mt-2 space-y-2 ${nivel <= 3 ? 'ml-4' : ''}`}>
      {lista.map((f) => (
        <li key={f.id}>
          <CartaoEvolucao e={f} complemento profissional={f.profissional_id ? nomeProf.get(f.profissional_id) : undefined} onComplementar={() => onComplementar(f)} />
          <Complementos filhos={filhos} paiId={f.id} nivel={nivel + 1} nomeProf={nomeProf} onComplementar={onComplementar} />
        </li>
      ))}
    </ul>
  )
}
