import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, Pencil, Plus, Search, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Customer } from '../lib/types'
import { brl, fmtDate, timeAgo } from '../lib/format'
import { Empty, Field, Modal, PageHeader, Reveal, Spinner, STATUS_CHIP, STATUS_LABEL } from '../components/ui'

const empty = () => ({ name: '', phone: '', email: '', status: 'lead' as Customer['status'], notes: '' })

export default function Customers() {
  const { company, toast } = useApp()
  const [items, setItems] = useState<Customer[]>([])
  const [totals, setTotals] = useState<Map<string, { total: number; last: string }>>(new Map())
  const [loading, setLoading] = useState(true)
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState('all')
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [c, s] = await Promise.all([supabase.from('customers').select('*').order('created_at', { ascending: false }), supabase.from('sales').select('customer_id,amount,sold_at,status').neq('status', 'cancelled')])
    setItems((c.data ?? []) as Customer[])
    const m = new Map<string, { total: number; last: string }>()
    for (const x of s.data ?? []) {
      if (!x.customer_id) continue
      const cur = m.get(x.customer_id) ?? { total: 0, last: '' }
      m.set(x.customer_id, { total: cur.total + Number(x.amount), last: x.sold_at > cur.last ? x.sold_at : cur.last })
    }
    setTotals(m)
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const shown = useMemo(
    () => items.filter((c) => (status === 'all' || c.status === status) && `${c.name} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase())),
    [items, q, status],
  )

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    setBusy(true)
    const phone = form.phone.replace(/\D/g, '')
    const row = { name: form.name.trim(), phone: phone ? (phone.length <= 11 ? '55' + phone : phone) : null, email: form.email || null, status: form.status, notes: form.notes || null }
    const { error } = editId ? await supabase.from('customers').update(row).eq('id', editId) : await supabase.from('customers').insert({ ...row, company_id: company.id })
    setBusy(false)
    if (error) return toast(error.message.includes('customers_company_phone') ? 'Já existe um cliente com esse telefone' : error.message, 'err')
    toast(editId ? 'Cliente atualizado' : 'Cliente cadastrado')
    setForm(null)
    load()
  }
  async function remove(c: Customer) {
    if (!confirm(`Excluir ${c.name}?`)) return
    await supabase.from('customers').delete().eq('id', c.id)
    load()
  }
  async function touch(c: Customer) {
    await supabase.from('customers').update({ last_contact_at: new Date().toISOString() }).eq('id', c.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Clientes (CRM)"
        subtitle="Leads e clientes. Quem chega pelo WhatsApp entra aqui automaticamente."
        actions={
          <button className="btn-primary" onClick={() => (setEditId(null), setForm(empty()))}>
            <Plus size={16} /> Novo cliente
          </button>
        }
      />
      <Reveal i={1} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="card flex flex-1 items-center gap-2 px-3 py-2">
          <Search size={16} className="text-muted" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {['all', 'lead', 'active', 'vip', 'inactive'].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold ${status === s ? 'border-ink bg-ink text-white' : 'border-line text-muted'}`}>
              {s === 'all' ? `Todos (${items.length})` : `${STATUS_LABEL[s]} (${items.filter((c) => c.status === s).length})`}
            </button>
          ))}
        </div>
      </Reveal>
      {loading ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Reveal i={2} className="card">
          <Empty icon={<Users size={26} />} title="Nenhum cliente" action={<button className="btn-primary" onClick={() => setForm(empty())}>Cadastrar cliente</button>} />
        </Reveal>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c, i) => {
            const t = totals.get(c.id)
            return (
              <Reveal key={c.id} i={Math.min(i, 12) + 2} step={50} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/40 to-brand-2/30 font-bold">{c.name[0]?.toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted">{c.phone ? '+' + c.phone : c.email ?? 'Sem contato'}</div>
                  </div>
                  <span className={`chip ${STATUS_CHIP[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl bg-panel-2 p-3">
                    <div className="text-muted">Total comprado</div>
                    <div className="font-semibold">{brl(t?.total ?? 0)}</div>
                  </div>
                  <div className="rounded-2xl bg-panel-2 p-3">
                    <div className="text-muted">Última compra</div>
                    <div className="font-semibold">{t?.last ? fmtDate(t.last) : '—'}</div>
                  </div>
                </div>
                {c.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">{c.notes}</p>}
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{c.last_contact_at ? `Contato ${timeAgo(c.last_contact_at)}` : 'Sem contato registrado'}</span>
                  <div className="flex gap-1">
                    {c.phone && (
                      <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" onClick={() => touch(c)} className="rounded-full p-1.5 text-emerald-600 hover:bg-panel-2" title="Abrir no WhatsApp">
                        <MessageCircle size={15} />
                      </a>
                    )}
                    <button
                      className="rounded-full p-1.5 hover:bg-panel-2"
                      onClick={() => (setEditId(c.id), setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', status: c.status, notes: c.notes ?? '' }))}
                    >
                      <Pencil size={14} />
                    </button>
                    <button className="rounded-full p-1.5 hover:bg-panel-2 hover:text-rose-600" onClick={() => remove(c)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={editId ? 'Editar cliente' : 'Novo cliente'}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <Field label="Nome">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="WhatsApp (com DDD)">
                <input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="11 99999-9999" />
              </Field>
              <Field label="E-mail">
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
            </div>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Customer['status'] })}>
                <option value="lead">Lead</option>
                <option value="active">Ativo</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inativo</option>
              </select>
            </Field>
            <Field label="Observações">
              <textarea className="input min-h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
