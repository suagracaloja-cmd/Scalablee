import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, MessageCircle, Pencil, Plus, Sparkles, UserX, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { cfgDe, dataLonga, DIAS_CURTO, maiuscula, erroAgenda, horariosLivres, hojeLocal, inicioSemana, linkWhatsApp, local, paraUtc, somaDias } from '../lib/agenda'
import { STATUS_AGENDA, TIPO_AGENDA, type Agendamento, type Customer, type Profissional, type Servico, type StatusAgenda } from '../lib/types'
import { brl } from '../lib/format'
import { Empty, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'

type Pac = Pick<Customer, 'id' | 'name' | 'phone' | 'etapa'>
type Form = {
  id: string | null
  pacienteId: string | null
  pacienteTexto: string
  telefoneNovo: string
  servicoId: string
  profissionalId: string
  data: string
  hora: string
  tipo: Agendamento['tipo']
  observacoes: string
}

export default function Agenda() {
  const { company, papel, toast } = useApp()
  const cfg = cfgDe(company)
  const [modo, setModo] = useState<'dia' | 'semana'>('dia')
  const [data, setData] = useState(() => hojeLocal(cfg.fuso))
  const [filtroProf, setFiltroProf] = useState<string>('todos')
  const [profs, setProfs] = useState<Profissional[]>([])
  const [servs, setServs] = useState<Servico[]>([])
  const [pacs, setPacs] = useState<Pac[]>([])
  const [ags, setAgs] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)

  const deData = modo === 'dia' ? data : inicioSemana(data)
  const ateData = modo === 'dia' ? data : somaDias(deData, 6)

  const load = useCallback(async () => {
    const de = paraUtc(deData, '00:00', cfg.fuso)
    const ate = paraUtc(somaDias(ateData, 1), '00:00', cfg.fuso)
    const [p, s, c, a] = await Promise.all([
      supabase.from('profissionais').select('*').order('nome'),
      supabase.from('servicos').select('*').order('nome'),
      supabase.from('customers').select('id,name,phone,etapa').order('name').limit(5000),
      supabase.from('agendamentos').select('*').gte('inicio', de.toISOString()).lt('inicio', ate.toISOString()).order('inicio'),
    ])
    setProfs((p.data ?? []) as Profissional[])
    setServs((s.data ?? []) as Servico[])
    setPacs((c.data ?? []) as Pac[])
    setAgs((a.data ?? []) as Agendamento[])
    setLoading(false)
  }, [deData, ateData, cfg.fuso])

  useEffect(() => {
    load()
  }, [load])

  // Atualiza sozinho quando alguém da equipe (ou a Coraline AI) mexe na agenda
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('agenda-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, load])

  const profAtivos = profs.filter((p) => p.ativo)
  const servAtivos = servs.filter((s) => s.ativo)
  const visiveis = useMemo(() => ags.filter((a) => filtroProf === 'todos' || a.profissional_id === filtroProf), [ags, filtroProf])
  const doDia = (d: string) => visiveis.filter((a) => local(a.inicio, cfg.fuso).data === d)
  const pacDe = (id: string | null) => pacs.find((p) => p.id === id)
  const profDe = (id: string | null) => profs.find((p) => p.id === id)
  const servDe = (id: string | null) => servs.find((s) => s.id === id)

  const resumo = useMemo(() => {
    const l = doDia(data)
    const n = (s: StatusAgenda) => l.filter((a) => a.status === s).length
    return { total: l.filter((a) => a.status !== 'cancelado').length, aConfirmar: n('agendado'), confirmadas: n('confirmado'), realizadas: n('realizado'), faltas: n('faltou') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, data])

  // ---------- formulário ----------
  const novo = (hora?: string, profissionalId?: string): Form => ({
    id: null,
    pacienteId: null,
    pacienteTexto: '',
    telefoneNovo: '',
    servicoId: servAtivos.length === 1 ? servAtivos[0].id : '',
    profissionalId: profissionalId ?? (filtroProf !== 'todos' ? filtroProf : profAtivos.length === 1 ? profAtivos[0].id : ''),
    data,
    hora: hora ?? '',
    tipo: 'consulta',
    observacoes: '',
  })
  const editar = (a: Agendamento) => {
    const l = local(a.inicio, cfg.fuso)
    setForm({
      id: a.id,
      pacienteId: a.customer_id,
      pacienteTexto: rotuloPac(pacDe(a.customer_id)),
      telefoneNovo: '',
      servicoId: a.servico_id ?? '',
      profissionalId: a.profissional_id ?? '',
      data: l.data,
      hora: l.hora,
      tipo: a.tipo,
      observacoes: a.observacoes ?? '',
    })
  }
  const duracaoForm = (f: Form) => servDe(f.servicoId || null)?.duracao_min ?? (f.id ? Math.round((Date.parse(ags.find((a) => a.id === f.id)!.fim) - Date.parse(ags.find((a) => a.id === f.id)!.inicio)) / 60000) : cfg.intervalo_min)

  // horários livres do dia escolhido no formulário (carrega as consultas daquele dia)
  const [agsForm, setAgsForm] = useState<Agendamento[]>([])
  useEffect(() => {
    if (!form?.data) return
    const de = paraUtc(form.data, '00:00', cfg.fuso)
    supabase
      .from('agendamentos')
      .select('*')
      .gte('inicio', new Date(de.getTime() - 12 * 3600000).toISOString())
      .lt('inicio', paraUtc(somaDias(form.data, 1), '00:00', cfg.fuso).toISOString())
      .then(({ data: d }) => setAgsForm((d ?? []) as Agendamento[]))
  }, [form?.data, cfg.fuso]) // eslint-disable-line react-hooks/exhaustive-deps
  const livres = form ? horariosLivres({ cfg, data: form.data, duracao: duracaoForm(form), profissionalId: form.profissionalId || null, agendamentos: agsForm, ignorarId: form.id ?? undefined }) : []

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    if (!form.hora) return toast('Escolha o horário.', 'err')
    if (profAtivos.length > 0 && !form.profissionalId) return toast('Escolha o profissional.', 'err')
    setBusy(true)
    try {
      let customerId = form.pacienteId
      if (!customerId) {
        const nome = form.pacienteTexto.trim()
        if (!nome) throw new Error('Informe o paciente.')
        let tel = form.telefoneNovo.replace(/\D/g, '')
        if (tel && tel.length <= 11) tel = '55' + tel
        const { data: criado, error } = await supabase.from('customers').insert({ company_id: company.id, name: nome, phone: tel || null, status: 'lead', etapa: 'agendado' }).select('id').single()
        if (error) throw new Error(error.message.includes('customers_company_phone') ? 'Já existe um paciente com esse telefone. Escolha-o na lista.' : error.message)
        customerId = criado.id
      }
      const inicio = paraUtc(form.data, form.hora, cfg.fuso)
      const fim = new Date(inicio.getTime() + duracaoForm(form) * 60000)
      const row = {
        customer_id: customerId,
        profissional_id: form.profissionalId || null,
        servico_id: form.servicoId || null,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        tipo: form.tipo,
        observacoes: form.observacoes.trim() || null,
        atualizado_em: new Date().toISOString(),
      }
      const antigo = form.id ? ags.find((a) => a.id === form.id) : null
      const mudouHorario = antigo && antigo.inicio !== row.inicio
      const { error } = form.id
        ? await supabase.from('agendamentos').update({ ...row, ...(mudouHorario ? { status: 'agendado', confirmado_em: null, lembrete_enviado_em: null } : {}) }).eq('id', form.id)
        : await supabase.from('agendamentos').insert({ ...row, company_id: company.id, origem: 'manual' })
      if (error) throw new Error(erroAgenda(error.message))
      await supabase.from('customers').update({ etapa: 'agendado' }).eq('id', customerId).in('etapa', ['novo', 'contato'])
      toast(form.id ? 'Consulta atualizada' : 'Consulta marcada')
      setForm(null)
      if (form.data < deData || form.data > ateData) setData(form.data)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function mudarStatus(a: Agendamento, status: StatusAgenda) {
    if (status === 'cancelado' && !confirm('Cancelar esta consulta? O horário fica livre.')) return
    const { error } = await supabase
      .from('agendamentos')
      .update({ status, atualizado_em: new Date().toISOString(), ...(status === 'confirmado' ? { confirmado_em: new Date().toISOString() } : {}) })
      .eq('id', a.id)
    if (error) return toast(erroAgenda(error.message), 'err')
    if (status === 'realizado' && a.customer_id) await supabase.from('customers').update({ etapa: 'compareceu' }).eq('id', a.customer_id).in('etapa', ['novo', 'contato', 'agendado'])
    toast(`Consulta: ${STATUS_AGENDA[status].label.toLowerCase()}`)
    load()
  }

  const semCadastro = !loading && profs.length === 0 && servs.length === 0
  const dias = modo === 'dia' ? [data] : Array.from({ length: 7 }, (_, i) => somaDias(deData, i))

  return (
    <div>
      <PageHeader
        title="Agenda"
        subtitle={`Consultas da clínica · atendimento ${cfg.inicio}–${cfg.fim}`}
        actions={
          <button className="btn-primary" onClick={() => setForm(novo())}>
            <Plus size={16} /> Nova consulta
          </button>
        }
      />

      {semCadastro && (
        <Reveal className="mb-4 flex flex-col gap-2 rounded-3xl bg-brand-soft p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Cadastre os profissionais, os serviços (com duração e preço) e o horário de atendimento para a agenda e a Coraline AI sugerirem os horários livres.</span>
          {papel === 'dono' ? (
            <Link to="/clinica" className="btn-ghost shrink-0">Configurar a clínica</Link>
          ) : (
            <span className="text-xs text-muted">Peça ao dono da conta para configurar.</span>
          )}
        </Reveal>
      )}

      {/* Navegação */}
      <Reveal i={1} className="card mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <button className="icon-btn" aria-label={modo === 'dia' ? 'Dia anterior' : 'Semana anterior'} onClick={() => setData(somaDias(data, modo === 'dia' ? -1 : -7))}>
            <ChevronLeft size={18} />
          </button>
          <button className="btn-ghost h-10 px-4 text-sm" onClick={() => setData(hojeLocal(cfg.fuso))}>
            Hoje
          </button>
          <button className="icon-btn" aria-label={modo === 'dia' ? 'Próximo dia' : 'Próxima semana'} onClick={() => setData(somaDias(data, modo === 'dia' ? 1 : 7))}>
            <ChevronRight size={18} />
          </button>
          <input type="date" className="input ml-auto h-10 w-auto min-w-0 lg:hidden" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Escolher data" />
        </div>
        {/* Celular: o dia e o resumo ganham uma linha só deles */}
        <div className="min-w-0 lg:ml-1 lg:flex-1">
          <div className="truncate font-bold">{modo === 'dia' ? maiuscula(dataLonga(data)) : `Semana de ${dataLonga(deData).split(', ')[1]}`}</div>
          {modo === 'dia' && (
            <div className="text-xs text-muted">
              {resumo.total} consulta(s) · {resumo.aConfirmar} a confirmar · {resumo.confirmadas} confirmada(s)
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input hidden h-10 w-auto lg:block" value={data} onChange={(e) => e.target.value && setData(e.target.value)} aria-label="Escolher data" />
          <div className="flex rounded-full bg-panel-2 p-1" role="tablist" aria-label="Visualização">
            {(['dia', 'semana'] as const).map((m) => (
              <button key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${modo === m ? 'bg-ink text-white' : 'text-muted'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {profAtivos.length > 1 && (
        <Reveal i={2} className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFiltroProf('todos')} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold ${filtroProf === 'todos' ? 'border-ink bg-ink text-white' : 'border-line text-muted'}`}>
            Todos os profissionais
          </button>
          {profAtivos.map((p) => (
            <button key={p.id} onClick={() => setFiltroProf(p.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold ${filtroProf === p.id ? 'border-ink bg-ink text-white' : 'border-line text-muted'}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.cor }} />
              {p.nome}
            </button>
          ))}
        </Reveal>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : modo === 'dia' ? (
        <Reveal i={3} className="card p-4 sm:p-5">
          {doDia(data).length === 0 ? (
            <Empty icon={<CalendarDays size={26} />} title="Nenhuma consulta neste dia" text={cfg.dias.includes(new Date(data + 'T12:00:00Z').getUTCDay()) ? 'Toque em "Nova consulta" para marcar.' : 'A clínica não atende neste dia da semana.'} />
          ) : (
            <ul className="space-y-2.5">
              {doDia(data).map((a) => (
                <CartaoConsulta key={a.id} a={a} fuso={cfg.fuso} pac={pacDe(a.customer_id)} prof={profDe(a.profissional_id)} serv={servDe(a.servico_id)} clinica={company?.name ?? ''} onStatus={mudarStatus} onEditar={editar} />
              ))}
            </ul>
          )}
        </Reveal>
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {dias.map((d, i) => {
            const l = doDia(d)
            const hoje = d === hojeLocal(cfg.fuso)
            return (
              <Reveal key={d} i={i + 3} step={40} className={`card min-h-28 p-3 ${hoje ? 'ring-2 ring-brand' : ''}`}>
                <button className="mb-2 flex w-full items-baseline justify-between text-left" onClick={() => (setData(d), setModo('dia'))} aria-label={`Ver ${dataLonga(d)}`}>
                  <span className="text-xs font-semibold uppercase text-muted">{DIAS_CURTO[new Date(d + 'T12:00:00Z').getUTCDay()]}</span>
                  <span className={`text-lg font-bold ${hoje ? 'text-brand-dark' : ''}`}>{Number(d.slice(8))}</span>
                </button>
                {l.length === 0 ? (
                  <p className="text-xs text-muted">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {l.map((a) => {
                      const pr = profDe(a.profissional_id)
                      return (
                        <li key={a.id}>
                          <button onClick={() => editar(a)} className={`w-full rounded-xl border-l-4 bg-panel-2 px-2 py-1.5 text-left text-xs ${a.status === 'cancelado' ? 'opacity-50 line-through' : ''}`} style={{ borderColor: pr?.cor ?? '#94a3b8' }}>
                            <span className="font-semibold">{local(a.inicio, cfg.fuso).hora}</span> {pacDe(a.customer_id)?.name ?? 'Sem paciente'}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Reveal>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar consulta' : 'Nova consulta'}>
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <Field label="Paciente">
              <input
                className="input"
                required
                maxLength={200}
                list="lista-pacientes"
                value={form.pacienteTexto}
                placeholder="Digite o nome para buscar ou cadastrar"
                onChange={(e) => {
                  const t = e.target.value
                  const achado = pacs.find((p) => rotuloPac(p) === t)
                  setForm({ ...form, pacienteTexto: t, pacienteId: achado?.id ?? null })
                }}
              />
              <datalist id="lista-pacientes">
                {pacs.map((p) => (
                  <option key={p.id} value={rotuloPac(p)} />
                ))}
              </datalist>
            </Field>
            {!form.pacienteId && form.pacienteTexto.trim() && (
              <Field label="WhatsApp do paciente novo (com DDD)">
                <input className="input" inputMode="tel" maxLength={40} value={form.telefoneNovo} onChange={(e) => setForm({ ...form, telefoneNovo: e.target.value })} placeholder="11 99999-9999" />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Serviço">
                <select className="input" value={form.servicoId} onChange={(e) => setForm({ ...form, servicoId: e.target.value, hora: '' })}>
                  <option value="">{servAtivos.length ? 'Escolha…' : 'Nenhum cadastrado'}</option>
                  {servAtivos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} · {s.duracao_min} min{s.preco != null ? ` · ${brl(Number(s.preco))}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Profissional">
                <select className="input" value={form.profissionalId} onChange={(e) => setForm({ ...form, profissionalId: e.target.value, hora: '' })} required={profAtivos.length > 0}>
                  <option value="">{profAtivos.length ? 'Escolha…' : 'Agenda geral'}</option>
                  {profAtivos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                      {p.especialidade ? ` · ${p.especialidade}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data">
                <input type="date" className="input" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value, hora: '' })} />
              </Field>
              <Field label="Tipo">
                <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Form['tipo'] })}>
                  {Object.entries(TIPO_AGENDA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-muted">
                Horário livre ({duracaoForm(form)} min){form.hora && <span className="text-ink"> · escolhido: {form.hora}</span>}
              </legend>
              {livres.length === 0 ? (
                <p className="rounded-xl bg-panel-2 px-3 py-2 text-xs text-muted">Sem horários livres neste dia para essa escolha. Tente outra data ou profissional.</p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {(form.hora && !livres.includes(form.hora) ? [form.hora, ...livres] : livres).map((h) => (
                    <button type="button" key={h} onClick={() => setForm({ ...form, hora: h })} aria-pressed={form.hora === h} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${form.hora === h ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
            <Field label="Observações">
              <textarea className="input min-h-16" maxLength={2000} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </Field>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} {form.id ? 'Salvar alterações' : 'Marcar consulta'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}

const rotuloPac = (p?: Pac) => (p ? `${p.name}${p.phone ? ` · ${p.phone.replace(/^55/, '')}` : ''}` : '')

function CartaoConsulta({
  a,
  fuso,
  pac,
  prof,
  serv,
  clinica,
  onStatus,
  onEditar,
}: {
  a: Agendamento
  fuso: string
  pac?: Pac
  prof?: Profissional
  serv?: Servico
  clinica: string
  onStatus: (a: Agendamento, s: StatusAgenda) => void
  onEditar: (a: Agendamento) => void
}) {
  const ini = local(a.inicio, fuso)
  const st = STATUS_AGENDA[a.status]
  const ativo = a.status === 'agendado' || a.status === 'confirmado'
  const msg = `Olá, ${pac?.name.split(' ')[0] ?? ''}! Aqui é da ${clinica}. Confirmando sua ${TIPO_AGENDA[a.tipo].toLowerCase()} ${dataLonga(ini.data)} às ${ini.hora}${prof ? ` com ${prof.nome}` : ''}. Podemos confirmar?`
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border border-line p-3 sm:flex-row sm:items-center ${a.status === 'cancelado' ? 'opacity-60' : ''}`} style={{ borderLeft: `4px solid ${prof?.cor ?? '#94a3b8'}` }}>
      <div className="flex w-20 shrink-0 items-center gap-1.5 font-bold sm:flex-col sm:items-start sm:gap-0">
        <span className="text-lg leading-tight">{ini.hora}</span>
        <span className="text-xs font-medium text-muted">até {local(a.fim, fuso).hora}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{pac?.name ?? 'Sem paciente'}</span>
          <span className={`chip ${st.cls}`}>{st.label}</span>
          {a.origem !== 'manual' && (
            <span className="chip bg-brand-soft text-ink" title={a.origem === 'ia' ? 'Marcada pela Coraline AI' : 'Marcada pelo WhatsApp'}>
              <Sparkles size={11} /> {a.origem === 'ia' ? 'Coraline AI' : 'WhatsApp'}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {[TIPO_AGENDA[a.tipo], serv?.nome, prof?.nome].filter(Boolean).join(' · ')}
          {a.observacoes ? ` · ${a.observacoes}` : ''}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {pac?.phone && ativo && (
          <a className="icon-btn h-9 w-9 text-emerald-600" href={linkWhatsApp(pac.phone, msg)} target="_blank" rel="noreferrer" title="Enviar confirmação pelo WhatsApp" aria-label={`Enviar confirmação para ${pac.name} pelo WhatsApp`}>
            <MessageCircle size={16} />
          </a>
        )}
        {a.status === 'agendado' && (
          <button className="btn-ghost h-9 px-3 text-xs" onClick={() => onStatus(a, 'confirmado')}>
            <Check size={14} /> Confirmar
          </button>
        )}
        {ativo && (
          <>
            <button className="btn-ghost h-9 px-3 text-xs" onClick={() => onStatus(a, 'realizado')}>
              <Clock size={14} /> Realizada
            </button>
            <button className="icon-btn h-9 w-9" onClick={() => onStatus(a, 'faltou')} title="Registrar falta" aria-label="Registrar falta">
              <UserX size={15} />
            </button>
            <button className="icon-btn h-9 w-9 hover:text-rose-600" onClick={() => onStatus(a, 'cancelado')} title="Cancelar consulta" aria-label="Cancelar consulta">
              <X size={15} />
            </button>
          </>
        )}
        <button className="icon-btn h-9 w-9" onClick={() => onEditar(a)} title="Editar ou remarcar" aria-label="Editar ou remarcar">
          <Pencil size={14} />
        </button>
      </div>
    </li>
  )
}
