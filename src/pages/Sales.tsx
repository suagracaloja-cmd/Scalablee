import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Customer, Sale } from '../lib/types'
import { addDays, brl, fmtDate, today } from '../lib/format'
import { Count, Empty, Field, Modal, Money, PageHeader, Reveal, Spinner, STATUS_CHIP, STATUS_DOT, STATUS_LABEL, StatusCard } from '../components/ui'

const empty = () => ({ description: '', amount: '', status: 'paid' as Sale['status'], sold_at: today(), customer_id: '' })
const PERIODS = [
  { v: '7', l: '7 dias' },
  { v: '30', l: '30 dias' },
  { v: '90', l: '90 dias' },
  { v: '365', l: '1 ano' },
  { v: 'all', l: 'Tudo' },
]

export default function Sales() {
  const { company, toast } = useApp()
  const [items, setItems] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Sale['status']>('all')
  const [period, setPeriod] = useState('30')
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    let query = supabase.from('sales').select('*').order('sold_at', { ascending: false }).order('created_at', { ascending: false }).limit(2000)
    if (period !== 'all') query = query.gte('sold_at', addDays(today(), -Number(period)))
    const [s, c] = await Promise.all([query, supabase.from('customers').select('*').order('name')])
    setItems(((s.data ?? []) as Sale[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setCustomers((c.data ?? []) as Customer[])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])
  const sum = (a: Sale[]) => a.reduce((x, y) => x + y.amount, 0)
  const byStatus = (st: Sale['status']) => items.filter((s) => s.status === st)
  const shown = items.filter((s) => (status === 'all' || s.status === status) && (s.description + ' ' + (names.get(s.customer_id ?? '') ?? '')).toLowerCase().includes(q.toLowerCase()))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    setBusy(true)
    const row = { description: form.description.trim(), amount: Number(String(form.amount).replace(',', '.')), status: form.status, sold_at: form.sold_at, customer_id: form.customer_id || null }
    const { error } = editId ? await supabase.from('sales').update(row).eq('id', editId) : await supabase.from('sales').insert({ ...row, company_id: company.id })
    if (!error && row.customer_id) {
      await supabase.from('customers').update({ status: 'active', last_contact_at: new Date().toISOString() }).eq('id', row.customer_id).eq('status', 'lead')
    }
    setBusy(false)
    if (error) return toast(error.message, 'err')
    toast(editId ? 'Venda atualizada' : 'Venda registrada! 🎉')
    setForm(null)
    load()
  }
  async function remove(s: Sale) {
    if (!confirm(`Excluir a venda "${s.description}"?`)) return
    await supabase.from('sales').delete().eq('id', s.id)
    load()
  }
  const edit = (s: Sale) => (setEditId(s.id), setForm({ description: s.description, amount: String(s.amount), status: s.status, sold_at: s.sold_at, customer_id: s.customer_id ?? '' }))

  return (
    <div>
      <PageHeader
        title="Vendas"
        subtitle="Registre suas vendas — o dashboard e a Coraline AI atualizam na hora."
        actions={
          <button className="btn-primary" onClick={() => (setEditId(null), setForm(empty()))}>
            <Plus size={16} /> Nova venda
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatusCard i={1} tone="blue" label="Total no período" value={<Money value={sum(items.filter((s) => s.status !== 'cancelled'))} delay={200} />} sub={<><Count value={items.filter((s) => s.status !== 'cancelled').length} /> vendas</>} />
        <StatusCard i={2} tone="green" label="Pagas" value={<Money value={sum(byStatus('paid'))} delay={300} />} sub={`${byStatus('paid').length} vendas`} />
        <StatusCard i={3} tone="amber" label="Aguardando pagamento" value={<Money value={sum(byStatus('pending'))} delay={400} />} sub={`${byStatus('pending').length} vendas`} />
        <StatusCard i={4} tone="slate" label="Canceladas" value={<Money value={sum(byStatus('cancelled'))} delay={500} />} sub={`${byStatus('cancelled').length} vendas`} />
      </div>

      <Reveal i={5} className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-sm">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input maxLength={100} className="h-11 w-full rounded-full bg-panel pl-11 pr-4 text-sm outline-none focus:ring-4 focus:ring-brand/10" placeholder="Buscar serviço ou paciente…" aria-label="Buscar venda" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(['all', 'paid', 'pending', 'cancelled'] as const).map((st) => (
            <button key={st} onClick={() => setStatus(st)} className={`h-10 shrink-0 rounded-full px-4 text-xs font-semibold ${status === st ? 'bg-ink text-white' : 'bg-panel text-ink'}`}>
              {st === 'all' ? 'Todas' : STATUS_LABEL[st]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-panel p-1 lg:ml-auto">
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)} className={`h-8 flex-1 whitespace-nowrap rounded-full px-2 text-xs min-[380px]:px-3 font-semibold ${period === p.v ? 'bg-ink text-white' : 'text-muted'}`}>
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
          <Empty icon={<ShoppingBag size={24} />} title="Nenhuma venda encontrada" action={<button className="btn-primary" onClick={() => setForm(empty())}>Registrar venda</button>} />
        ) : (
          <>
            {/* Celular */}
            <ul className="divide-y divide-line md:hidden">
              {shown.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3.5" onClick={() => edit(s)}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <ShoppingBag size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.description}</span>
                    <span className="block truncate text-xs text-muted">
                      {fmtDate(s.sold_at)} · {s.customer_id ? names.get(s.customer_id) : 'Sem cliente'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold tabular-nums">{brl(s.amount)}</span>
                    <span className={`chip mt-0.5 ${STATUS_CHIP[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* Desktop */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-panel-2 text-xs text-muted">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Produto / serviço</th>
                  <th className="px-4 py-3.5 font-semibold">Cliente</th>
                  <th className="px-4 py-3.5 font-semibold">Data</th>
                  <th className="px-4 py-3.5 text-right font-semibold">Valor</th>
                  <th className="px-4 py-3.5 font-semibold">Status</th>
                  <th className="px-6 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((s, i) => (
                  <tr key={s.id} className="reveal border-t border-line hover:bg-panel-2/60" style={{ '--d': `${Math.min(i, 15) * 35 + 300}ms` } as React.CSSProperties}>
                    <td className="px-6 py-3.5 font-semibold">{s.description}</td>
                    <td className="px-4 py-3.5 text-muted">{s.customer_id ? names.get(s.customer_id) : '—'}</td>
                    <td className="px-4 py-3.5 text-muted">{fmtDate(s.sold_at)}</td>
                    <td className="px-4 py-3.5 text-right font-bold tabular-nums">{brl(s.amount)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`chip ${STATUS_CHIP[s.status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
                        {STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button className="icon-btn h-8 w-8" onClick={() => edit(s)} title="Editar">
                        <Pencil size={13} />
                      </button>
                      <button className="icon-btn ml-1.5 h-8 w-8 hover:text-rose-600" onClick={() => remove(s)} title="Excluir">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Reveal>

      <Modal open={!!form} onClose={() => setForm(null)} title={editId ? 'Editar venda' : 'Nova venda'}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Produto / serviço">
              <input maxLength={500} className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Camiseta básica" list="sale-products" />
              <datalist id="sale-products">
                {[...new Set(items.map((i) => i.description))].slice(0, 30).map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$)">
                <input maxLength={20} className="input" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
              </Field>
              <Field label="Data">
                <input className="input" type="date" required value={form.sold_at} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} />
              </Field>
            </div>
            <Field label="Cliente (opcional)">
              <select className="input" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— Sem paciente —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <div className="grid grid-cols-3 gap-2">
                {(['paid', 'pending', 'cancelled'] as const).map((st) => (
                  <button type="button" key={st} onClick={() => setForm({ ...form, status: st })} className={`h-10 rounded-full text-xs font-semibold ${form.status === st ? 'bg-ink text-white' : 'bg-panel-2'}`}>
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex gap-2 pt-1">
              {editId && (
                <button type="button" className="btn-danger" onClick={() => { const s = items.find((x) => x.id === editId); setForm(null); if (s) remove(s) }}>
                  <Trash2 size={15} />
                </button>
              )}
              <button className="btn-primary flex-1" disabled={busy}>
                {busy && <Spinner />} Salvar venda
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
