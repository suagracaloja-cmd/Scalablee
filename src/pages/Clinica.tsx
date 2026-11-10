import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Clock, Mail, Pencil, Plus, Stethoscope, Tag, Trash2, Users } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { cfgDe, DIAS_LONGO } from '../lib/agenda'
import { PAPEL_LABEL, type AgendaConfig, type Convite, type Membro, type Profissional, type Servico } from '../lib/types'
import { brl, fmtDate } from '../lib/format'
import { Empty, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'

const ABAS = [
  { id: 'equipe', label: 'Equipe', icon: Users },
  { id: 'profissionais', label: 'Profissionais', icon: Stethoscope },
  { id: 'servicos', label: 'Serviços', icon: Tag },
  { id: 'horarios', label: 'Horários', icon: Clock },
] as const
type Aba = (typeof ABAS)[number]['id']
const CORES = ['#48a8fc', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b']

/** Configurações da clínica (só o dono): equipe e convites, profissionais, serviços e horário de atendimento. */
export default function Clinica() {
  const [aba, setAba] = useState<Aba>('equipe')
  return (
    <div>
      <PageHeader title="Clínica e equipe" subtitle="Quem usa o sistema, profissionais, serviços e horários de atendimento." />
      <Reveal className="mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Seções">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${aba === a.id ? 'border-ink bg-ink text-white' : 'border-line text-muted hover:text-ink'}`}>
            <a.icon size={15} /> {a.label}
          </button>
        ))}
        </div>
      </Reveal>
      {aba === 'equipe' && <Equipe />}
      {aba === 'profissionais' && <Profissionais />}
      {aba === 'servicos' && <Servicos />}
      {aba === 'horarios' && <Horarios />}
    </div>
  )
}

// ---------------- Equipe ----------------
function Equipe() {
  const { company, session, toast } = useApp()
  const [membros, setMembros] = useState<Membro[]>([])
  const [convites, setConvites] = useState<Convite[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: '', email: '', papel: 'recepcao' as Membro['papel'] })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([supabase.from('membros').select('*').order('criado_em'), supabase.from('convites').select('*').is('aceito_em', null).order('criado_em', { ascending: false })])
    setMembros((m.data ?? []) as Membro[])
    setConvites((c.data ?? []) as Convite[])
    setLoading(false)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function convidar(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    const email = form.email.trim().toLowerCase()
    if (email === session?.user.email?.toLowerCase()) return toast('Esse é o seu e-mail: você já é o dono da conta.', 'err')
    setBusy(true)
    const { error } = await supabase.from('convites').insert({ company_id: company.id, email, nome: form.nome.trim() || null, papel: form.papel })
    setBusy(false)
    if (error) return toast(/duplicate|unique/.test(error.message) ? 'Já existe um convite para esse e-mail.' : error.message, 'err')
    toast('Convite criado')
    setForm({ nome: '', email: '', papel: 'recepcao' })
    load()
  }
  async function cancelarConvite(c: Convite) {
    if (!confirm(`Cancelar o convite de ${c.email}?`)) return
    await supabase.from('convites').delete().eq('id', c.id)
    load()
  }
  async function mudarPapel(m: Membro, papel: Membro['papel']) {
    const { error } = await supabase.from('membros').update({ papel }).eq('user_id', m.user_id)
    if (error) return toast(error.message, 'err')
    toast('Papel atualizado')
    load()
  }
  async function remover(m: Membro) {
    if (!confirm(`Remover ${m.nome ?? m.email} da equipe? A pessoa perde o acesso à clínica.`)) return
    try {
      await api('equipe', { action: 'remover', user_id: m.user_id })
      toast('Removido da equipe')
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Reveal i={1} className="card p-5 sm:p-6">
        <h2 className="font-semibold">Quem tem acesso</h2>
        <p className="mt-1 text-sm text-muted">
          <b className="text-ink">Recepção:</b> agenda, pacientes, WhatsApp, vendas, aprovações e tarefas. <b className="text-ink">Profissional:</b> agenda, pacientes e tarefas. Só o dono vê o financeiro, a assinatura e estas configurações.
        </p>
        {loading ? (
          <div className="py-6">
            <Spinner />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            <li className="flex items-center gap-3 py-3">
              <Avatar texto={session?.user.email ?? '?'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{session?.user.email}</div>
                <div className="text-xs text-muted">Você</div>
              </div>
              <span className="chip bg-ink text-white">{PAPEL_LABEL.dono}</span>
            </li>
            {membros.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar texto={m.nome ?? m.email ?? '?'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.nome ?? m.email}</div>
                  <div className="truncate text-xs text-muted">{m.email} · desde {fmtDate(m.criado_em)}</div>
                </div>
                <select className="input h-9 w-auto py-0 text-xs" value={m.papel} onChange={(e) => mudarPapel(m, e.target.value as Membro['papel'])} aria-label={`Papel de ${m.nome ?? m.email}`}>
                  <option value="recepcao">{PAPEL_LABEL.recepcao}</option>
                  <option value="profissional">{PAPEL_LABEL.profissional}</option>
                </select>
                <button className="icon-btn h-9 w-9 hover:text-rose-600" onClick={() => remover(m)} title="Remover da equipe" aria-label={`Remover ${m.nome ?? m.email} da equipe`}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {convites.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold">Convites aguardando</h3>
            <ul className="mt-2 space-y-2">
              {convites.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-panel-2 px-3 py-2.5 text-sm">
                  <Mail size={16} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    {c.nome ? `${c.nome} · ` : ''}
                    {c.email} <span className="text-muted">· {PAPEL_LABEL[c.papel]}</span>
                  </span>
                  <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => cancelarConvite(c)}>
                    Cancelar
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Reveal>
      <Reveal i={2} className="card p-5 sm:p-6">
        <h2 className="font-semibold">Convidar alguém</h2>
        <p className="mt-1 text-sm text-muted">
          A pessoa cria a conta em <b className="text-ink">{location.host}</b> com este mesmo e-mail e entra na clínica automaticamente. Envie o endereço do site para ela pelo WhatsApp.
        </p>
        <form onSubmit={convidar} className="mt-4 space-y-3">
          <Field label="Nome">
            <input className="input" maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Ana (recepção)" />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Papel">
            <select className="input" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value as Membro['papel'] })}>
              <option value="recepcao">{PAPEL_LABEL.recepcao}</option>
              <option value="profissional">{PAPEL_LABEL.profissional}</option>
            </select>
          </Field>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner size={14} /> : <Plus size={16} />} Criar convite
          </button>
        </form>
      </Reveal>
    </div>
  )
}

function Avatar({ texto }: { texto: string }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold">{texto[0]?.toUpperCase()}</span>
}

// ---------------- Profissionais ----------------
type FormProf = { id: string | null; nome: string; especialidade: string; cor: string; user_id: string; ativo: boolean }
function Profissionais() {
  const { company, toast } = useApp()
  const [itens, setItens] = useState<Profissional[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormProf | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [p, m] = await Promise.all([supabase.from('profissionais').select('*').order('nome'), supabase.from('membros').select('*').eq('papel', 'profissional')])
    setItens((p.data ?? []) as Profissional[])
    setMembros((m.data ?? []) as Membro[])
    setLoading(false)
  }, [])
  useEffect(() => {
    load()
  }, [load])
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    setBusy(true)
    const row = { nome: form.nome.trim(), especialidade: form.especialidade.trim() || null, cor: form.cor, user_id: form.user_id || null, ativo: form.ativo }
    const { error } = form.id ? await supabase.from('profissionais').update(row).eq('id', form.id) : await supabase.from('profissionais').insert({ ...row, company_id: company.id })
    setBusy(false)
    if (error) return toast(error.message, 'err')
    toast(form.id ? 'Profissional atualizado' : 'Profissional cadastrado')
    setForm(null)
    load()
  }
  return (
    <Reveal i={1} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Profissionais</h2>
          <p className="text-sm text-muted">Quem atende na agenda. Cada um tem uma cor na agenda.</p>
        </div>
        <button className="btn-primary" onClick={() => setForm({ id: null, nome: '', especialidade: '', cor: CORES[itens.length % CORES.length], user_id: '', ativo: true })}>
          <Plus size={16} /> Novo profissional
        </button>
      </div>
      {loading ? (
        <div className="py-6">
          <Spinner />
        </div>
      ) : itens.length === 0 ? (
        <Empty icon={<Stethoscope size={26} />} title="Nenhum profissional cadastrado" text="Cadastre quem atende para organizar a agenda por profissional." />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {itens.map((p) => (
            <li key={p.id} className={`flex items-center gap-3 py-3 ${p.ativo ? '' : 'opacity-50'}`}>
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: p.cor }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.nome}</div>
                <div className="truncate text-xs text-muted">
                  {[p.especialidade, membros.find((m) => m.user_id === p.user_id) ? `login: ${membros.find((m) => m.user_id === p.user_id)?.email}` : null, p.ativo ? null : 'inativo'].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <button className="icon-btn h-9 w-9" onClick={() => setForm({ id: p.id, nome: p.nome, especialidade: p.especialidade ?? '', cor: p.cor, user_id: p.user_id ?? '', ativo: p.ativo })} aria-label={`Editar ${p.nome}`}>
                <Pencil size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar profissional' : 'Novo profissional'}>
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <Field label="Nome">
              <input className="input" required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Dra. Ana Souza" />
            </Field>
            <Field label="Especialidade">
              <input className="input" maxLength={120} value={form.especialidade} onChange={(e) => setForm({ ...form, especialidade: e.target.value })} placeholder="Ex: Dentista, Dermatologista…" />
            </Field>
            <fieldset>
              <legend className="label">Cor na agenda</legend>
              <div className="flex flex-wrap gap-2">
                {CORES.map((c) => (
                  <button type="button" key={c} onClick={() => setForm({ ...form, cor: c })} aria-label={`Cor ${c}`} aria-pressed={form.cor === c} className={`h-8 w-8 rounded-full ring-offset-2 ${form.cor === c ? 'ring-2 ring-ink' : ''}`} style={{ background: c }} />
                ))}
              </div>
            </fieldset>
            <Field label="Login do profissional (opcional)">
              <select className="input" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">Sem login</option>
                {membros.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome ?? m.email}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#48a8fc]" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Atendendo (aparece na agenda)
            </label>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} Salvar
            </button>
          </form>
        )}
      </Modal>
    </Reveal>
  )
}

// ---------------- Serviços ----------------
type FormServ = { id: string | null; nome: string; duracao_min: string; preco: string; ativo: boolean }
function Servicos() {
  const { company, toast } = useApp()
  const [itens, setItens] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormServ | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('servicos').select('*').order('nome')
    setItens((data ?? []) as Servico[])
    setLoading(false)
  }, [])
  useEffect(() => {
    load()
  }, [load])
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    const preco = form.preco.trim() ? Number(form.preco.replace(/\./g, '').replace(',', '.')) : null
    if (preco !== null && !(preco >= 0)) return toast('Preço inválido', 'err')
    setBusy(true)
    const row = { nome: form.nome.trim(), duracao_min: Number(form.duracao_min), preco, ativo: form.ativo }
    const { error } = form.id ? await supabase.from('servicos').update(row).eq('id', form.id) : await supabase.from('servicos').insert({ ...row, company_id: company.id })
    setBusy(false)
    if (error) return toast(error.message, 'err')
    toast(form.id ? 'Serviço atualizado' : 'Serviço cadastrado')
    setForm(null)
    load()
  }
  return (
    <Reveal i={1} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Serviços e procedimentos</h2>
          <p className="text-sm text-muted">A duração define o tamanho do horário na agenda. A Coraline AI usa os preços cadastrados aqui.</p>
        </div>
        <button className="btn-primary" onClick={() => setForm({ id: null, nome: '', duracao_min: '30', preco: '', ativo: true })}>
          <Plus size={16} /> Novo serviço
        </button>
      </div>
      {loading ? (
        <div className="py-6">
          <Spinner />
        </div>
      ) : itens.length === 0 ? (
        <Empty icon={<Tag size={26} />} title="Nenhum serviço cadastrado" text="Ex: Consulta, Avaliação, Limpeza, Aplicação de toxina…" />
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {itens.map((s) => (
            <li key={s.id} className={`flex items-center gap-3 py-3 ${s.ativo ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.nome}</div>
                <div className="text-xs text-muted">
                  {s.duracao_min} min{s.preco != null ? ` · ${brl(Number(s.preco))}` : ''}
                  {s.ativo ? '' : ' · inativo'}
                </div>
              </div>
              <button
                className="icon-btn h-9 w-9"
                onClick={() => setForm({ id: s.id, nome: s.nome, duracao_min: String(s.duracao_min), preco: s.preco != null ? String(s.preco).replace('.', ',') : '', ativo: s.ativo })}
                aria-label={`Editar ${s.nome}`}
              >
                <Pencil size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Editar serviço' : 'Novo serviço'}>
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <Field label="Nome">
              <input className="input" required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração (minutos)">
                <input className="input" type="number" min={5} max={600} step={5} required value={form.duracao_min} onChange={(e) => setForm({ ...form, duracao_min: e.target.value })} />
              </Field>
              <Field label="Preço (R$, opcional)">
                <input className="input" inputMode="decimal" maxLength={15} value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} placeholder="0,00" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#48a8fc]" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo
            </label>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} Salvar
            </button>
          </form>
        )}
      </Modal>
    </Reveal>
  )
}

// ---------------- Horários ----------------
const FUSOS = [
  { v: '-02:00', l: 'Fernando de Noronha (UTC−2)' },
  { v: '-03:00', l: 'Brasília (UTC−3)' },
  { v: '-04:00', l: 'Amazonas, MT, MS, RO, RR (UTC−4)' },
  { v: '-05:00', l: 'Acre (UTC−5)' },
]
function Horarios() {
  const { company, reloadCompany, toast } = useApp()
  const [cfg, setCfg] = useState<AgendaConfig>(() => cfgDe(company))
  const [busy, setBusy] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    if (!cfg.dias.length) return toast('Escolha pelo menos um dia.', 'err')
    if (cfg.fim <= cfg.inicio) return toast('O fim do atendimento precisa ser depois do início.', 'err')
    setBusy(true)
    const { error } = await supabase.from('companies').update({ agenda_config: cfg }).eq('id', company.id)
    setBusy(false)
    if (error) return toast(error.message, 'err')
    await reloadCompany()
    toast('Horários salvos')
  }
  return (
    <Reveal i={1} className="card max-w-2xl p-5 sm:p-6">
      <h2 className="font-semibold">Horário de atendimento</h2>
      <p className="text-sm text-muted">A agenda e a Coraline AI só oferecem horários dentro destes dias e horas.</p>
      <form onSubmit={salvar} className="mt-4 space-y-4">
        <fieldset>
          <legend className="label">Dias de atendimento</legend>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = cfg.dias.includes(d)
              return (
                <button type="button" key={d} aria-pressed={on} onClick={() => setCfg({ ...cfg, dias: on ? cfg.dias.filter((x) => x !== d) : [...cfg.dias, d].sort() })} className={`rounded-full border px-3.5 py-2 text-sm font-semibold capitalize ${on ? 'border-ink bg-ink text-white' : 'border-line text-muted'}`}>
                  {DIAS_LONGO[d]}
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Abre às">
            <input className="input" type="time" required value={cfg.inicio} onChange={(e) => setCfg({ ...cfg, inicio: e.target.value })} />
          </Field>
          <Field label="Fecha às">
            <input className="input" type="time" required value={cfg.fim} onChange={(e) => setCfg({ ...cfg, fim: e.target.value })} />
          </Field>
          <Field label="Intervalo entre horários">
            <select className="input" value={cfg.intervalo_min} onChange={(e) => setCfg({ ...cfg, intervalo_min: Number(e.target.value) })}>
              {[10, 15, 20, 30, 40, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutos
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Fuso horário da clínica">
          <select className="input" value={cfg.fuso} onChange={(e) => setCfg({ ...cfg, fuso: e.target.value })}>
            {FUSOS.map((f) => (
              <option key={f.v} value={f.v}>
                {f.l}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn-primary" disabled={busy}>
          {busy && <Spinner />} Salvar horários
        </button>
      </form>
    </Reveal>
  )
}
