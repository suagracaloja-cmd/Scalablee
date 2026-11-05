import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Check, Pencil, Plus, Trash2, Undo2, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Transaction } from '../lib/types'
import { brl, fmtDate, today } from '../lib/format'
import { Bars } from '../components/LineChart'
import { Empty, Field, Modal, Money, PageHeader, Reveal, Spinner } from '../components/ui'

const CATS = { expense: ['Fornecedores', 'Aluguel', 'Salários', 'Impostos', 'Marketing', 'Energia/Água/Internet', 'Outros'], income: ['Vendas', 'Serviços', 'Outros'] }
const empty = (type: Transaction['type'] = 'expense') => ({ type, description: '', category: '', amount: '', due_date: today(), paid: false })

export default function Finance() {
  const { company, toast } = useApp()
  const [items, setItems] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'open' | 'paid'>('open')
  const [type, setType] = useState<'all' | 'expense' | 'income'>('all')
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('transactions').select('*').order('due_date')
    setItems(((data ?? []) as Transaction[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const t = today()
  const m = useMemo(() => {
    const monthStart = t.slice(0, 8) + '01'
    const open = items.filter((x) => !x.paid_at)
    const sum = (a: Transaction[]) => a.reduce((s, x) => s + x.amount, 0)
    const paidMonth = items.filter((x) => x.paid_at && x.paid_at >= monthStart)
    const byCat = new Map<string, number>()
    for (const x of items.filter((x) => x.type === 'expense' && x.due_date >= monthStart)) byCat.set(x.category || 'Outros', (byCat.get(x.category || 'Outros') ?? 0) + x.amount)
    return {
      payable: sum(open.filter((x) => x.type === 'expense')),
      receivable: sum(open.filter((x) => x.type === 'income')),
      overdue: sum(open.filter((x) => x.type === 'expense' && x.due_date < t)),
      balance: sum(paidMonth.filter((x) => x.type === 'income')) - sum(paidMonth.filter((x) => x.type === 'expense')),
      cats: [...byCat].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: 'bg-gradient-to-t from-amber-500 to-yellow-300' })),
    }
  }, [items, t])

  const shown = items
    .filter((x) => (tab === 'open' ? !x.paid_at : !!x.paid_at))
    .filter((x) => type === 'all' || x.type === type)
    .sort((a, b) => (tab === 'open' ? a.due_date.localeCompare(b.due_date) : (b.paid_at ?? '').localeCompare(a.paid_at ?? '')))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form || !company) return
    setBusy(true)
    const row = {
      type: form.type,
      description: form.description.trim(),
      category: form.category || null,
      amount: Number(String(form.amount).replace(',', '.')),
      due_date: form.due_date,
      paid_at: form.paid ? today() : null,
    }
    const { error } = editId ? await supabase.from('transactions').update(row).eq('id', editId) : await supabase.from('transactions').insert({ ...row, company_id: company.id })
    setBusy(false)
    if (error) return toast(error.message, 'err')
    toast('Lançamento salvo')
    setForm(null)
    load()
  }
  async function togglePaid(x: Transaction) {
    await supabase.from('transactions').update({ paid_at: x.paid_at ? null : today() }).eq('id', x.id)
    toast(x.paid_at ? 'Marcado como em aberto' : x.type === 'expense' ? 'Conta paga ✅' : 'Recebimento confirmado ✅')
    load()
  }
  async function remove(x: Transaction) {
    if (!confirm(`Excluir "${x.description}"?`)) return
    await supabase.from('transactions').delete().eq('id', x.id)
    load()
  }

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Contas a pagar e a receber. O agente financeiro avisa vencimentos e riscos."
        actions={
          <>
            <button className="btn-ghost" onClick={() => (setEditId(null), setForm(empty('income')))}>
              <ArrowUpCircle size={16} className="text-emerald-300" /> A receber
            </button>
            <button className="btn-primary" onClick={() => (setEditId(null), setForm(empty('expense')))}>
              <Plus size={16} /> Conta a pagar
            </button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: 'A pagar (em aberto)', v: m.payable, c: 'text-rose-300' },
          { l: 'Vencido', v: m.overdue, c: m.overdue ? 'text-rose-400' : '' },
          { l: 'A receber', v: m.receivable, c: 'text-emerald-300' },
          { l: 'Saldo pago no mês', v: m.balance, c: m.balance >= 0 ? 'text-emerald-300' : 'text-rose-300' },
        ].map((k, i) => (
          <Reveal key={k.l} i={i + 1} className="card p-4">
            <div className="text-xs text-muted">{k.l}</div>
            <Money value={k.v} className={`text-xl font-bold ${k.c}`} delay={200 + i * 100} />
          </Reveal>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal i={5} className="card overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            {(['open', 'paid'] as const).map((x) => (
              <button key={x} onClick={() => setTab(x)} className={`rounded-lg px-3 py-1.5 text-xs ${tab === x ? 'bg-brand text-white' : 'text-muted'}`}>
                {x === 'open' ? 'Em aberto' : 'Pagos / recebidos'}
              </button>
            ))}
            <select className="ml-auto rounded-lg bg-panel-2 px-2 py-1.5 text-xs" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">Tudo</option>
              <option value="expense">A pagar</option>
              <option value="income">A receber</option>
            </select>
          </div>
          {loading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : shown.length === 0 ? (
            <Empty icon={<Wallet size={26} />} title="Nenhum lançamento" />
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((x, i) => {
                const late = !x.paid_at && x.due_date < t
                return (
                  <li key={x.id} className="reveal flex items-center gap-3 px-4 py-3" style={{ '--d': `${Math.min(i, 15) * 40 + 300}ms` } as React.CSSProperties}>
                    {x.type === 'expense' ? <ArrowDownCircle size={18} className="shrink-0 text-rose-300" /> : <ArrowUpCircle size={18} className="shrink-0 text-emerald-300" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{x.description}</div>
                      <div className={`text-xs ${late ? 'text-rose-300' : 'text-muted'}`}>
                        {x.paid_at ? `Pago em ${fmtDate(x.paid_at)}` : `${late ? 'Venceu' : 'Vence'} ${fmtDate(x.due_date)}`} {x.category && `· ${x.category}`}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums">{brl(x.amount)}</div>
                    <button onClick={() => togglePaid(x)} className={`rounded-lg p-1.5 ${x.paid_at ? 'text-muted' : 'text-emerald-300'} hover:bg-panel-2`} title={x.paid_at ? 'Desfazer' : 'Marcar como pago'}>
                      {x.paid_at ? <Undo2 size={15} /> : <Check size={15} />}
                    </button>
                    <button
                      className="rounded-lg p-1.5 text-muted hover:bg-panel-2"
                      onClick={() => (setEditId(x.id), setForm({ type: x.type, description: x.description, category: x.category ?? '', amount: String(x.amount), due_date: x.due_date, paid: !!x.paid_at }))}
                    >
                      <Pencil size={14} />
                    </button>
                    <button className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-rose-300" onClick={() => remove(x)}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Reveal>
        <Reveal i={6} className="card p-4">
          <h2 className="mb-3 font-semibold">Despesas do mês por categoria</h2>
          {m.cats.length ? <Bars data={m.cats} delay={800} /> : <p className="py-6 text-center text-sm text-muted">Sem despesas este mês.</p>}
        </Reveal>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.type === 'income' ? 'Valor a receber' : 'Conta a pagar'}>
        {form && (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-panel-2 p-1 text-sm">
              {(['expense', 'income'] as const).map((ty) => (
                <button type="button" key={ty} onClick={() => setForm({ ...form, type: ty, category: '' })} className={`rounded-lg py-1.5 ${form.type === ty ? 'bg-brand text-white' : 'text-muted'}`}>
                  {ty === 'expense' ? 'A pagar' : 'A receber'}
                </button>
              ))}
            </div>
            <Field label="Descrição">
              <input className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={form.type === 'expense' ? 'Ex: Aluguel da loja' : 'Ex: Pagamento cliente João'} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$)">
                <input className="input" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Vencimento">
                <input className="input" type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Categoria">
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {CATS[form.type].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-violet-500" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> Já está {form.type === 'expense' ? 'pago' : 'recebido'}
            </label>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} Salvar
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
