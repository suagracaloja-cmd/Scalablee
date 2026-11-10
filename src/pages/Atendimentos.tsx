import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, Stethoscope, Trash2, UserRoundCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { FORMAS_PAGAMENTO, TIPOS_ATENDIMENTO, type Customer, type FormaPagamento, type Sale, type Servico, type TipoAtendimento } from '../lib/types'
import { addDays, brl, fmtDate, today } from '../lib/format'
import { cpfValido, formatarCpf, mascararCpf, soDigitos } from '../lib/cpf'
import { AGENT_NAME } from '../lib/areas'
import { Count, Empty, Field, Modal, Money, PageHeader, Reveal, Spinner, STATUS_CHIP, STATUS_DOT, StatusCard } from '../components/ui'

/** Situação do pagamento do atendimento */
const SITUACAO: Record<Sale['status'], string> = { paid: 'Pago', pending: 'A receber', cancelled: 'Cancelado' }
const TIPO_LABEL = Object.fromEntries(TIPOS_ATENDIMENTO.map((t) => [t.id, t.label])) as Record<TipoAtendimento, string>
const PERIODS = [
  { v: '7', l: '7 dias' },
  { v: '30', l: '30 dias' },
  { v: '90', l: '90 dias' },
  { v: '365', l: '1 ano' },
  { v: 'all', l: 'Tudo' },
]

type Paciente = Pick<Customer, 'id' | 'name' | 'phone' | 'email' | 'status' | 'etapa' | 'data_nascimento' | 'cpf'>
const vazio = () => ({
  customer_id: '',
  nome: '',
  cpf: '',
  nascimento: '',
  telefone: '',
  email: '',
  tipo: 'consulta' as TipoAtendimento,
  description: '',
  amount: '',
  sold_at: today(),
  status: 'paid' as Sale['status'],
  forma_pagamento: '' as FormaPagamento | '',
})
type Form = ReturnType<typeof vazio>

/** Valor digitado em reais: 400 · 400,00 · 1.500,00 · 1.500 · 400.50 */
const lerValor = (v: string) => {
  const t = v.trim().replace(/[R$\s]/g, '')
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  return Number(t)
}

/** O telefone fica salvo com o 55 do Brasil na frente (formato do WhatsApp); no formulário aparece sem ele. */
const telefoneNoCampo = (p: string | null | undefined) => (p && p.startsWith('55') && p.length >= 12 ? p.slice(2) : (p ?? ''))
const telefoneParaSalvar = (t: string) => {
  const d = soDigitos(t)
  return d ? (d.length <= 11 ? '55' + d : d) : null
}
const dadosDoPaciente = (c: Paciente) => ({
  customer_id: c.id,
  nome: c.name,
  cpf: formatarCpf(c.cpf ?? ''),
  nascimento: c.data_nascimento ?? '',
  telefone: telefoneNoCampo(c.phone),
  email: c.email ?? '',
})

export default function Atendimentos() {
  const { company, toast } = useApp()
  const [items, setItems] = useState<Sale[]>([])
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [servicos, setServicos] = useState<Pick<Servico, 'id' | 'nome' | 'preco'>[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Sale['status']>('all')
  const [period, setPeriod] = useState('30')
  const [form, setForm] = useState<Form | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')

  const load = async () => {
    let query = supabase.from('sales').select('*').order('sold_at', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
    if (period !== 'all') query = query.gte('sold_at', addDays(today(), -Number(period)))
    const [s, c, sv] = await Promise.all([
      query,
      supabase.from('customers').select('id,name,phone,email,status,etapa,data_nascimento,cpf').order('name').limit(5000),
      supabase.from('servicos').select('id,nome,preco').eq('ativo', true).order('nome'),
    ])
    setItems(((s.data ?? []) as Sale[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setPacientes((c.data ?? []) as Paciente[])
    setServicos(((sv.data ?? []) as Servico[]).map((x) => ({ ...x, preco: x.preco === null ? null : Number(x.preco) })))
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const porId = useMemo(() => new Map(pacientes.map((c) => [c.id, c])), [pacientes])
  const sum = (a: Sale[]) => a.reduce((x, y) => x + y.amount, 0)
  const validos = items.filter((s) => s.status !== 'cancelled')
  const byStatus = (st: Sale['status']) => items.filter((s) => s.status === st)
  const shown = items.filter((s) => {
    if (status !== 'all' && s.status !== status) return false
    const t = q.trim().toLowerCase()
    if (!t) return true
    const p = porId.get(s.customer_id ?? '')
    const d = soDigitos(t)
    return (
      `${s.description} ${p?.name ?? ''} ${TIPO_LABEL[s.tipo as TipoAtendimento] ?? ''}`.toLowerCase().includes(t) ||
      (d.length >= 3 && (`${p?.cpf ?? ''}`.includes(d) || `${p?.phone ?? ''}`.includes(d)))
    )
  })

  // Pacientes já cadastrados que combinam com o que está sendo digitado (nome, CPF ou telefone)
  const sugestoes = useMemo(() => {
    if (!form || form.customer_id) return []
    const n = form.nome.trim().toLowerCase()
    const d = soDigitos(form.cpf) || soDigitos(form.telefone)
    if (n.length < 2 && d.length < 4) return []
    return pacientes.filter((c) => (n.length >= 2 && c.name.toLowerCase().includes(n)) || (d.length >= 4 && (`${c.cpf ?? ''}`.includes(d) || `${c.phone ?? ''}`.includes(d)))).slice(0, 5)
  }, [form, pacientes])

  const novo = () => (setEditId(null), setAviso(''), setForm(vazio()))
  const editar = (s: Sale) => {
    const p = porId.get(s.customer_id ?? '')
    setEditId(s.id)
    setAviso('')
    setForm({
      ...vazio(),
      ...(p ? dadosDoPaciente(p) : {}),
      tipo: (s.tipo as TipoAtendimento) ?? 'outro',
      description: s.description,
      amount: String(s.amount).replace('.', ','),
      sold_at: s.sold_at,
      status: s.status,
      forma_pagamento: (s.forma_pagamento as FormaPagamento) ?? '',
    })
  }
  const escolherPaciente = (c: Paciente) => form && (setForm({ ...form, ...dadosDoPaciente(c) }), setAviso(`Paciente já cadastrado: os dados de ${c.name} foram preenchidos.`))
  const trocarPaciente = () => form && (setForm({ ...form, customer_id: '', nome: '', cpf: '', nascimento: '', telefone: '', email: '' }), setAviso(''))
  const mudarCpf = (v: string) => {
    if (!form) return
    const cpf = formatarCpf(v)
    const d = soDigitos(cpf)
    // CPF completo de alguém já cadastrado: liga o atendimento a esse paciente
    const existente = !form.customer_id && d.length === 11 ? pacientes.find((c) => c.cpf === d) : undefined
    if (existente) return escolherPaciente(existente)
    setForm({ ...form, cpf })
  }
  const escolherServico = (nome: string) => {
    if (!form) return
    const sv = servicos.find((x) => x.nome === nome)
    setForm({ ...form, description: nome, amount: sv?.preco && !form.amount ? String(sv.preco).replace('.', ',') : form.amount })
  }

  const cpfErro = form && !cpfValido(form.cpf) ? 'CPF inválido. Confira os números.' : ''

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    if (cpfErro) return toast(cpfErro, 'err')
    const amount = lerValor(form.amount)
    if (!form.amount.trim() || !Number.isFinite(amount) || amount < 0) return toast('Valor inválido. Use, por exemplo, 400 ou 400,00.', 'err')
    setBusy(true)
    try {
      // 1) Paciente: usa o já cadastrado (atualizando os dados) ou cadastra um novo
      const cpf = soDigitos(form.cpf) || null
      const phone = telefoneParaSalvar(form.telefone)
      const dados = { name: form.nome.trim(), cpf, phone, email: form.email.trim() || null, data_nascimento: form.nascimento || null }
      let customerId = form.customer_id
      if (!customerId) {
        const mesmo = pacientes.find((c) => (cpf && c.cpf === cpf) || (phone && c.phone === phone))
        if (mesmo) {
          customerId = mesmo.id
          // Achou pelo CPF ou telefone: completa só o que veio preenchido, sem apagar o que já existia
          const soPreenchidos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null && v !== ''))
          const { error } = await supabase.from('customers').update(soPreenchidos).eq('id', customerId)
          if (error) throw error
        } else {
          const { data, error } = await supabase
            .from('customers')
            .insert({ ...dados, company_id: company.id, status: 'active', etapa: form.status === 'paid' ? 'fechado' : 'compareceu' })
            .select('id')
            .single()
          if (error) throw error
          customerId = data.id
        }
      } else {
        const { error } = await supabase.from('customers').update(dados).eq('id', customerId)
        if (error) throw error
      }

      // 2) Atendimento
      const row = {
        customer_id: customerId,
        tipo: form.tipo,
        description: form.description.trim(),
        amount,
        sold_at: form.sold_at,
        status: form.status,
        forma_pagamento: form.forma_pagamento || null,
      }
      const { error } = editId ? await supabase.from('sales').update(row).eq('id', editId) : await supabase.from('sales').insert({ ...row, company_id: company.id })
      if (error) throw error

      // 3) Pagou: vira paciente ativo e sai do funil como "fechado"
      if (form.status === 'paid') {
        await supabase.from('customers').update({ status: 'active', last_contact_at: new Date().toISOString() }).eq('id', customerId).eq('status', 'lead')
        await supabase.from('customers').update({ etapa: 'fechado' }).eq('id', customerId).neq('etapa', 'fechado')
      }
      toast(editId ? 'Atendimento atualizado' : 'Atendimento registrado')
      setForm(null)
      load()
    } catch (err) {
      const m = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err)
      toast(
        m.includes('customers_company_cpf')
          ? 'Já existe outro paciente com esse CPF. Busque pelo nome ou CPF e escolha o cadastro dele.'
          : m.includes('customers_company_phone')
            ? 'Já existe outro paciente com esse telefone. Busque pelo nome ou telefone e escolha o cadastro dele.'
            : m.includes('customers_cpf_valido')
              ? 'CPF inválido. Confira os números.'
              : m,
        'err',
      )
    } finally {
      setBusy(false)
    }
  }
  async function remover(s: Sale) {
    const p = porId.get(s.customer_id ?? '')
    if (!confirm(`Excluir o atendimento "${s.description}"${p ? ` de ${p.name}` : ''}? O cadastro do paciente continua.`)) return
    const { error } = await supabase.from('sales').delete().eq('id', s.id)
    if (error) return toast(error.message, 'err')
    toast('Atendimento excluído')
    load()
  }

  const n = validos.length
  return (
    <div>
      <PageHeader
        title="Atendimentos"
        subtitle="Cada paciente atendido: o que foi feito, quanto custou e como pagou. As despesas ficam em Financeiro."
        actions={
          <button className="btn-primary" onClick={novo}>
            <Plus size={16} /> Novo atendimento
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatusCard i={1} tone="blue" label="Faturado no período" value={<Money value={sum(validos)} delay={200} />} sub={<><Count value={n} /> atendimento(s)</>} />
        <StatusCard i={2} tone="green" label="Recebido" value={<Money value={sum(byStatus('paid'))} delay={300} />} sub={`${byStatus('paid').length} pago(s)`} />
        <StatusCard i={3} tone="amber" label="A receber" value={<Money value={sum(byStatus('pending'))} delay={400} />} sub={`${byStatus('pending').length} aguardando`} />
        <StatusCard i={4} tone="slate" label="Ticket médio" value={<Money value={n ? sum(validos) / n : 0} delay={500} />} sub={`${byStatus('cancelled').length} cancelado(s)`} />
      </div>

      <Reveal i={5} className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input maxLength={100} className="h-11 w-full rounded-full bg-panel pl-11 pr-4 text-sm outline-none focus:ring-4 focus:ring-brand/10" placeholder="Buscar paciente, CPF ou procedimento…" aria-label="Buscar atendimento" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(['all', 'paid', 'pending', 'cancelled'] as const).map((st) => (
            <button key={st} onClick={() => setStatus(st)} aria-pressed={status === st} className={`h-10 shrink-0 rounded-full px-4 text-xs font-semibold ${status === st ? 'bg-ink text-white' : 'bg-panel text-ink'}`}>
              {st === 'all' ? 'Todos' : SITUACAO[st]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-panel p-1 lg:ml-auto">
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)} aria-pressed={period === p.v} className={`h-8 flex-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold min-[380px]:px-3 ${period === p.v ? 'bg-ink text-white' : 'text-muted'}`}>
              {p.l}
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal i={6} className="card mt-4 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <Empty icon={<Stethoscope size={24} />} title="Nenhum atendimento encontrado" text="Registre cada paciente atendido com o procedimento e o valor." action={<button className="btn-primary" onClick={novo}>Registrar atendimento</button>} />
        ) : (
          <>
            {/* Celular */}
            <ul className="divide-y divide-line md:hidden">
              {shown.map((s) => {
                const p = porId.get(s.customer_id ?? '')
                return (
                  <li key={s.id}>
                    <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={() => editar(s)}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
                        <Stethoscope size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p?.name ?? 'Sem paciente'}</span>
                        <span className="block truncate text-xs text-muted">
                          {s.tipo ? `${TIPO_LABEL[s.tipo as TipoAtendimento]} · ` : ''}
                          {s.description}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {fmtDate(s.sold_at)}
                          {s.forma_pagamento ? ` · ${FORMAS_PAGAMENTO[s.forma_pagamento as FormaPagamento]}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold tabular-nums">{brl(s.amount)}</span>
                        <span className={`chip mt-0.5 ${STATUS_CHIP[s.status]}`}>{SITUACAO[s.status]}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {/* Computador */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-panel-2 text-xs text-muted">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Paciente</th>
                  <th className="px-4 py-3.5 font-semibold">Atendimento</th>
                  <th className="px-4 py-3.5 font-semibold">Data</th>
                  <th className="px-4 py-3.5 font-semibold">Pagamento</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Valor</th>
                  <th className="px-4 py-3.5 font-semibold">Situação</th>
                  <th className="px-6 py-3.5">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((s, i) => {
                  const p = porId.get(s.customer_id ?? '')
                  return (
                    <tr key={s.id} className="reveal border-t border-line hover:bg-panel-2/60" style={{ '--d': `${Math.min(i, 15) * 35 + 300}ms` } as React.CSSProperties}>
                      <td className="px-6 py-3.5">
                        <div className="font-semibold">{p?.name ?? '—'}</div>
                        {p?.cpf && <div className="text-xs text-muted">CPF {mascararCpf(p.cpf)}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium">{s.description}</div>
                        {s.tipo && <div className="text-xs text-muted">{TIPO_LABEL[s.tipo as TipoAtendimento]}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-muted">{fmtDate(s.sold_at)}</td>
                      <td className="px-4 py-3.5 text-muted">{s.forma_pagamento ? FORMAS_PAGAMENTO[s.forma_pagamento as FormaPagamento] : '—'}</td>
                      <td className="px-4 py-3.5 text-right font-bold tabular-nums">{brl(s.amount)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`chip ${STATUS_CHIP[s.status]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
                          {SITUACAO[s.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-right">
                        <button className="icon-btn h-8 w-8" onClick={() => editar(s)} title="Editar" aria-label={`Editar atendimento ${s.description}`}>
                          <Pencil size={13} />
                        </button>
                        <button className="icon-btn ml-1.5 h-8 w-8 hover:text-rose-600" onClick={() => remover(s)} title="Excluir" aria-label={`Excluir atendimento ${s.description}`}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </Reveal>

      <Modal open={!!form} onClose={() => setForm(null)} title={editId ? 'Editar atendimento' : 'Novo atendimento'} wide>
        {form && (
          <form onSubmit={salvar} className="space-y-5">
            {/* Paciente */}
            <fieldset className="space-y-3">
              <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-bold">
                Paciente
                {form.customer_id && (
                  <button type="button" onClick={trocarPaciente} className="text-xs font-semibold text-brand-dark underline underline-offset-2">
                    Trocar paciente
                  </button>
                )}
              </legend>
              {aviso && (
                <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800" role="status">
                  <UserRoundCheck size={15} className="shrink-0" /> {aviso}
                </p>
              )}
              <div className="relative">
                <Field label="Nome completo">
                  <input
                    maxLength={200}
                    className="input"
                    required
                    autoComplete="off"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Digite o nome; se já for paciente, ele aparece aqui"
                  />
                </Field>
                {sugestoes.length > 0 && (
                  <ul className="mt-1.5 overflow-hidden rounded-2xl border border-line bg-panel shadow-lg" aria-label="Pacientes já cadastrados">
                    {sugestoes.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => escolherPaciente(c)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-panel-2">
                          <span className="min-w-0 truncate font-semibold">{c.name}</span>
                          <span className="shrink-0 text-xs text-muted">{c.cpf ? `CPF ${mascararCpf(c.cpf)}` : c.phone ? `+${c.phone}` : 'já cadastrado'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="CPF">
                  <input
                    className={`input ${cpfErro ? 'border-rose-400 focus:border-rose-400' : ''}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.cpf}
                    onChange={(e) => mudarCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    aria-invalid={!!cpfErro}
                    aria-describedby={cpfErro ? 'cpf-erro' : undefined}
                  />
                  {cpfErro && (
                    <span id="cpf-erro" className="mt-1 block text-xs font-medium text-rose-600">
                      {cpfErro}
                    </span>
                  )}
                </Field>
                <Field label="Data de nascimento">
                  <input className="input" type="date" max={today()} value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} />
                </Field>
                <Field label="Telefone / WhatsApp (com DDD)">
                  <input maxLength={40} className="input" type="tel" inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="11 99999-9999" />
                </Field>
                <Field label="E-mail">
                  <input maxLength={254} className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="paciente@email.com" />
                </Field>
              </div>
            </fieldset>

            {/* Atendimento */}
            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="sr-only">Atendimento</legend>
              <p className="text-sm font-bold" aria-hidden="true">
                Atendimento
              </p>
              <Field label="Tipo">
                <div className="flex flex-wrap gap-2">
                  {TIPOS_ATENDIMENTO.map((t) => (
                    <button type="button" key={t.id} aria-pressed={form.tipo === t.id} onClick={() => setForm({ ...form, tipo: t.id })} className={`h-9 rounded-full px-3.5 text-xs font-semibold ${form.tipo === t.id ? 'bg-ink text-white' : 'bg-panel-2'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="O que foi feito">
                <input
                  maxLength={500}
                  className="input"
                  required
                  value={form.description}
                  onChange={(e) => escolherServico(e.target.value)}
                  placeholder="Ex.: Limpeza de pele, Hemograma, Cirurgia de catarata"
                  list="atendimento-servicos"
                />
                <datalist id="atendimento-servicos">
                  {[...new Set([...servicos.map((s) => s.nome), ...items.map((i) => i.description)])].slice(0, 40).map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor (R$)">
                  <input maxLength={20} className="input" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="400,00" />
                </Field>
                <Field label="Data">
                  <input className="input" type="date" required value={form.sold_at} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} />
                </Field>
              </div>
              <Field label="Forma de pagamento">
                <select className="input" value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value as FormaPagamento | '' })}>
                  <option value="">Não informada</option>
                  {Object.entries(FORMAS_PAGAMENTO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Situação do pagamento">
                <div className="grid grid-cols-3 gap-2">
                  {(['paid', 'pending', 'cancelled'] as const).map((st) => (
                    <button type="button" key={st} aria-pressed={form.status === st} onClick={() => setForm({ ...form, status: st })} className={`h-10 rounded-full text-xs font-semibold ${form.status === st ? 'bg-ink text-white' : 'bg-panel-2'}`}>
                      {SITUACAO[st]}
                    </button>
                  ))}
                </div>
              </Field>
            </fieldset>

            <p className="text-[11px] leading-relaxed text-muted">
              CPF, nascimento e contato ficam no cadastro do paciente e só a equipe da clínica vê. O CPF não é enviado à {AGENT_NAME}.
            </p>
            <div className="flex gap-2">
              {editId && (
                <button
                  type="button"
                  className="btn-danger"
                  aria-label="Excluir atendimento"
                  onClick={() => {
                    const s = items.find((x) => x.id === editId)
                    setForm(null)
                    if (s) remover(s)
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button className="btn-primary flex-1" disabled={busy || !!cpfErro}>
                {busy && <Spinner />} Salvar atendimento
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
