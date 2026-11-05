import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Customer, Sale } from '../lib/types'
import { addDays, brl, fmtDate, today } from '../lib/format'
import { Empty, Field, Modal, Money, PageHeader, Reveal, Spinner, STATUS_CHIP, STATUS_LABEL } from '../components/ui'

const empty = () => ({ description: '', amount: '', status: 'paid' as Sale['status'], sold_at: today(), customer_id: '' })

export default function Sales() {
  const { company, toast } = useApp()
  const [items, setItems] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('30')
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    let query = supabase.from('sales').select('*').order('sold_at', { ascending: false }).order('created_at', { ascending: false })
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
  const shown = items.filter((s) => (s.description + ' ' + (names.get(s.customer_id ?? '') ?? '')).toLowerCase().includes(q.toLowerCase()))
  const total = shown.filter((s) => s.status !== 'cancelled').reduce((a, b) => a + b.amount, 0)
  const pending = shown.filter((s) => s.status === 'pending').reduce((a, b) => a + b.amount, 0)

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

  return (
    <div>
      <PageHeader
        title="Vendas"
        subtitle="Registre suas vendas — o dashboard e os agentes atualizam na hora."
        actions={
          <button className="btn-primary" onClick={() => (setEditId(null), setForm(empty()))}>
            <Plus size={16} /> Nova venda
          </button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Reveal i={1} className="card p-4">
          <div className="text-xs text-muted">Total no período</div>
          <Money value={total} className="text-xl font-bold" delay={200} />
        </Reveal>
        <Reveal i={2} className="card p-4">
          <div className="text-xs text-muted">A receber (pendentes)</div>
          <Money value={pending} className="text-xl font-bold text-amber-300" delay={300} />
        </Reveal>
        <Reveal i={3} className="card col-span-2 flex items-center gap-2 p-3 sm:col-span-1">
          <Search size={16} className="text-muted" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="rounded-lg bg-panel-2 px-2 py-1 text-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="365">1 ano</option>
            <option value="all">Tudo</option>
          </select>
        </Reveal>
      </div>

      <Reveal i={4} className="card overflow-hidden">
        {loading ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <Empty icon={<ShoppingBag size={26} />} title="Nenhuma venda no período" action={<button className="btn-primary" onClick={() => setForm(empty())}>Registrar venda</button>} />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((s, i) => (
              <li key={s.id} className="reveal flex items-center gap-3 px-4 py-3" style={{ '--d': `${Math.min(i, 15) * 40 + 300}ms` } as React.CSSProperties}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.description}</div>
                  <div className="truncate text-xs text-muted">
                    {fmtDate(s.sold_at)} {s.customer_id && `· ${names.get(s.customer_id) ?? ''}`}
                  </div>
                </div>
                <span className={`chip ${STATUS_CHIP[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                <div className="w-24 text-right text-sm font-semibold tabular-nums sm:w-28">{brl(s.amount)}</div>
                <button className="p-1.5 text-muted hover:text-slate-200" onClick={() => (setEditId(s.id), setForm({ description: s.description, amount: String(s.amount), status: s.status, sold_at: s.sold_at, customer_id: s.customer_id ?? '' }))}>
                  <Pencil size={14} />
                </button>
                <button className="p-1.5 text-muted hover:text-rose-300" onClick={() => remove(s)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Modal open={!!form} onClose={() => setForm(null)} title={editId ? 'Editar venda' : 'Nova venda'}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <Field label="Produto / serviço">
              <input className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Camiseta básica" list="sale-products" />
              <datalist id="sale-products">
                {[...new Set(items.map((i) => i.description))].slice(0, 30).map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$)">
                <input className="input" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
              </Field>
              <Field label="Data">
                <input className="input" type="date" required value={form.sold_at} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} />
              </Field>
            </div>
            <Field label="Cliente (opcional)">
              <select className="input" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">— Sem cliente —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Sale['status'] })}>
                <option value="paid">Pago</option>
                <option value="pending">Pendente (a receber)</option>
                <option value="cancelled">Cancelada</option>
              </select>
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
