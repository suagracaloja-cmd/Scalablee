import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, Columns3, List, MessageCircle, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { ETAPAS, etapaInfo, ORIGENS, type Customer, type Etapa } from '../lib/types'
import { brl, fmtDate, timeAgo } from '../lib/format'
import { Empty, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'

const empty = () => ({ name: '', phone: '', email: '', status: 'lead' as Customer['status'], notes: '', etapa: 'novo' as Etapa, proximo_contato: '', origem: '', data_nascimento: '' })
type Form = ReturnType<typeof empty>
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)

export default function Customers() {
  const { company, papel, toast } = useApp()
  const [items, setItems] = useState<Customer[]>([])
  const [totals, setTotals] = useState<Map<string, { total: number; last: string }>>(new Map())
  const [proximas, setProximas] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [etapa, setEtapa] = useState<'todas' | 'followup' | Etapa>('todas')
  const [modo, setModo] = useState<'lista' | 'funil'>('lista')
  const [form, setForm] = useState<Form | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const veVendas = papel !== 'profissional'

  const load = async () => {
    const [c, s, a] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      veVendas ? supabase.from('sales').select('customer_id,amount,sold_at,status').neq('status', 'cancelled') : Promise.resolve({ data: [] as { customer_id: string | null; amount: number; sold_at: string }[] }),
      supabase.from('agendamentos').select('customer_id,inicio').gte('inicio', new Date().toISOString()).in('status', ['agendado', 'confirmado']).order('inicio'),
    ])
    setItems((c.data ?? []) as Customer[])
    const m = new Map<string, { total: number; last: string }>()
    for (const x of s.data ?? []) {
      if (!x.customer_id) continue
      const cur = m.get(x.customer_id) ?? { total: 0, last: '' }
      m.set(x.customer_id, { total: cur.total + Number(x.amount), last: x.sold_at > cur.last ? x.sold_at : cur.last })
    }
    setTotals(m)
    const p = new Map<string, string>()
    for (const x of a.data ?? []) if (x.customer_id && !p.has(x.customer_id)) p.set(x.customer_id, x.inicio)
    setProximas(p)
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const busca = (c: Customer) => `${c.name} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase())
  const followUp = (c: Customer) => !!c.proximo_contato && c.proximo_contato <= hoje() && !['fechado', 'perdido'].includes(c.etapa ?? '')
  const shown = useMemo(
    () => items.filter((c) => busca(c) && (etapa === 'todas' || (etapa === 'followup' ? followUp(c) : (c.etapa ?? 'novo') === etapa))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, q, etapa],
  )
  const nFollow = items.filter(followUp).length

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    setBusy(true)
    const phone = form.phone.replace(/\D/g, '')
    const row = {
      name: form.name.trim(),
      phone: phone ? (phone.length <= 11 ? '55' + phone : phone) : null,
      email: form.email || null,
      status: form.status,
      notes: form.notes || null,
      etapa: form.etapa,
      proximo_contato: form.proximo_contato || null,
      origem: form.origem || null,
      data_nascimento: form.data_nascimento || null,
    }
    const { error } = editId ? await supabase.from('customers').update(row).eq('id', editId) : await supabase.from('customers').insert({ ...row, company_id: company.id })
    setBusy(false)
    if (error) return toast(error.message.includes('customers_company_phone') ? 'Já existe um paciente com esse telefone' : error.message, 'err')
    toast(editId ? 'Paciente atualizado' : 'Paciente cadastrado')
    setForm(null)
    load()
  }
  async function moverEtapa(c: Customer, nova: Etapa) {
    const { error } = await supabase.from('customers').update({ etapa: nova }).eq('id', c.id)
    if (error) return toast(error.message, 'err')
    setItems((l) => l.map((x) => (x.id === c.id ? { ...x, etapa: nova } : x)))
  }
  async function remove(c: Customer) {
    if (!confirm(`Excluir ${c.name}? As consultas dele continuam na agenda, sem o nome.`)) return
    await supabase.from('customers').delete().eq('id', c.id)
    load()
  }
  async function touch(c: Customer) {
    await supabase.from('customers').update({ last_contact_at: new Date().toISOString() }).eq('id', c.id)
    load()
  }
  const abrir = (c: Customer) => (
    setEditId(c.id),
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      status: c.status,
      notes: c.notes ?? '',
      etapa: (c.etapa ?? 'novo') as Etapa,
      proximo_contato: c.proximo_contato ?? '',
      origem: c.origem ?? '',
      data_nascimento: c.data_nascimento ?? '',
    })
  )

  return (
    <div>
      <PageHeader
        title="Pacientes"
        subtitle="Cadastro, funil de atendimento e follow-ups. Quem chega pelo WhatsApp entra aqui automaticamente."
        actions={
          <button className="btn-primary" onClick={() => (setEditId(null), setForm(empty()))}>
            <Plus size={16} /> Novo paciente
          </button>
        }
      />
      <Reveal i={1} className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="card flex flex-1 items-center gap-2 px-3 py-2">
          <Search size={16} className="text-muted" />
          <input maxLength={100} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-full bg-panel p-1" role="tablist" aria-label="Visualização">
          <button role="tab" aria-selected={modo === 'lista'} onClick={() => setModo('lista')} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${modo === 'lista' ? 'bg-ink text-white' : 'text-muted'}`}>
            <List size={15} /> Lista
          </button>
          <button role="tab" aria-selected={modo === 'funil'} onClick={() => setModo('funil')} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${modo === 'funil' ? 'bg-ink text-white' : 'text-muted'}`}>
            <Columns3 size={15} /> Funil
          </button>
        </div>
      </Reveal>
      {modo === 'lista' && (
        <Reveal i={2} className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          <Filtro on={etapa === 'todas'} onClick={() => setEtapa('todas')}>
            Todos ({items.filter(busca).length})
          </Filtro>
          {nFollow > 0 && (
            <Filtro on={etapa === 'followup'} onClick={() => setEtapa('followup')} alerta>
              <BellRing size={13} /> Follow-up hoje ({nFollow})
            </Filtro>
          )}
          {ETAPAS.map((e) => (
            <Filtro key={e.id} on={etapa === e.id} onClick={() => setEtapa(e.id)}>
              {e.label} ({items.filter((c) => busca(c) && (c.etapa ?? 'novo') === e.id).length})
            </Filtro>
          ))}
        </Reveal>
      )}

      {loading ? (
        <Spinner />
      ) : modo === 'funil' ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {ETAPAS.map((e, i) => {
            const col = items.filter((c) => busca(c) && (c.etapa ?? 'novo') === e.id)
            return (
              <Reveal key={e.id} i={i + 2} step={40} className="card w-64 shrink-0 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`chip ${e.cls}`}>{e.label}</span>
                  <span className="text-xs font-semibold text-muted">{col.length}</span>
                </div>
                <ul className="space-y-2">
                  {col.slice(0, 60).map((c) => (
                    <li key={c.id} className="rounded-2xl bg-panel-2 p-2.5">
                      <button className="block w-full truncate text-left text-sm font-semibold hover:underline" onClick={() => abrir(c)}>
                        {c.name}
                      </button>
                      <div className="mt-0.5 truncate text-[11px] text-muted">
                        {proximas.get(c.id) ? `Consulta ${fmtDate(proximas.get(c.id)!)}` : c.proximo_contato ? `Contato ${fmtDate(c.proximo_contato)}` : c.phone ? '+' + c.phone : 'Sem contato'}
                      </div>
                      <select className="mt-1.5 w-full rounded-lg border border-line bg-panel px-2 py-1 text-[11px]" value={c.etapa ?? 'novo'} onChange={(ev) => moverEtapa(c, ev.target.value as Etapa)} aria-label={`Etapa de ${c.name}`}>
                        {ETAPAS.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                  {col.length === 0 && <li className="py-3 text-center text-xs text-muted">—</li>}
                </ul>
              </Reveal>
            )
          })}
        </div>
      ) : shown.length === 0 ? (
        <Reveal i={3} className="card">
          <Empty icon={<Users size={26} />} title="Nenhum paciente aqui" action={<button className="btn-primary" onClick={() => (setEditId(null), setForm(empty()))}>Cadastrar paciente</button>} />
        </Reveal>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c, i) => {
            const t = totals.get(c.id)
            const et = etapaInfo(c.etapa)
            const prox = proximas.get(c.id)
            return (
              <Reveal key={c.id} i={Math.min(i, 12) + 3} step={50} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/40 to-brand-2/30 font-bold" aria-hidden="true">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted">
                      {c.phone ? '+' + c.phone : (c.email ?? 'Sem contato')}
                      {c.origem ? ` · ${ORIGENS[c.origem] ?? c.origem}` : ''}
                    </div>
                  </div>
                  <span className={`chip ${et.cls}`}>{et.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl bg-panel-2 p-3">
                    <div className="text-muted">Próxima consulta</div>
                    <div className="font-semibold">{prox ? fmtDate(prox) : '—'}</div>
                  </div>
                  {veVendas ? (
                    <div className="rounded-2xl bg-panel-2 p-3">
                      <div className="text-muted">Total gasto</div>
                      <div className="font-semibold">{brl(t?.total ?? 0)}</div>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-panel-2 p-3">
                      <div className="text-muted">Paciente desde</div>
                      <div className="font-semibold">{fmtDate(c.created_at)}</div>
                    </div>
                  )}
                </div>
                {followUp(c) && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
                    <BellRing size={13} /> Follow-up {c.proximo_contato! < hoje() ? `atrasado (${fmtDate(c.proximo_contato!)})` : 'hoje'}
                  </p>
                )}
                {c.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">{c.notes}</p>}
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{c.last_contact_at ? `Contato ${timeAgo(c.last_contact_at)}` : 'Sem contato registrado'}</span>
                  <div className="flex gap-1">
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" onClick={() => touch(c)} className="rounded-full p-1.5 text-emerald-600 hover:bg-panel-2" title="Abrir no WhatsApp" aria-label={`Abrir conversa com ${c.name} no WhatsApp`}>
                        <MessageCircle size={15} />
                      </a>
                    )}
                    <button className="rounded-full p-1.5 hover:bg-panel-2" onClick={() => abrir(c)} aria-label={`Editar ${c.name}`} title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button className="rounded-full p-1.5 hover:bg-panel-2 hover:text-rose-600" onClick={() => remove(c)} aria-label={`Excluir ${c.name}`} title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={editId ? 'Editar paciente' : 'Novo paciente'}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <Field label="Nome">
              <input maxLength={200} className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="WhatsApp (com DDD)">
                <input maxLength={40} className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="11 99999-9999" />
              </Field>
              <Field label="E-mail">
                <input maxLength={254} className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Etapa no funil">
                <select className="input" value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value as Etapa })}>
                  {ETAPAS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Próximo contato (follow-up)">
                <input className="input" type="date" value={form.proximo_contato} onChange={(e) => setForm({ ...form, proximo_contato: e.target.value })} />
              </Field>
              <Field label="Como conheceu a clínica">
                <select className="input" value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })}>
                  <option value="">Não informado</option>
                  {Object.entries(ORIGENS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data de nascimento">
                <input className="input" type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
              </Field>
            </div>
            <Field label="Situação">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Customer['status'] })}>
                <option value="lead">Lead (ainda não é paciente)</option>
                <option value="active">Ativo</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inativo</option>
              </select>
            </Field>
            <Field label="Observações (não coloque dados clínicos aqui — o prontuário chega na próxima etapa)">
              <textarea maxLength={5000} className="input min-h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} Salvar
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}

function Filtro({ on, onClick, alerta, children }: { on: boolean; onClick: () => void; alerta?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold ${on ? 'border-ink bg-ink text-white' : alerta ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-line text-muted'}`}>
      {children}
    </button>
  )
}
