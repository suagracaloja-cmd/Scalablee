import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, ChevronRight, Play, ShoppingBag, Sparkles, Users, Wallet } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Approval, Customer, Insight, Sale, Task, Transaction } from '../lib/types'
import { addDays, brl, brlShort, fmtDate, relativeDay, timeAgo, toISO, today } from '../lib/format'
import { AgentMark, AreaChip, CoralineIcon, Count, Delta, Money, Reveal, Spinner, STATUS_CHIP, STATUS_DOT, STATUS_LABEL } from '../components/ui'
import { DONUT_COLORS, Donut, DualBars, LineChart } from '../components/LineChart'
import { AGENT_NAME, SUGGESTIONS, areaOf } from '../lib/areas'
import { HojeNaAgenda } from '../components/HojeNaAgenda'

type Range = 7 | 30 | 90

export default function Dashboard() {
  const { company, papel, toast, reloadCounts } = useApp()
  const dono = papel === 'dono'
  const [ask, setAsk] = useState('')
  const navigate = useNavigate()
  const [sales, setSales] = useState<Sale[]>([])
  const [txs, setTxs] = useState<Transaction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [ready, setReady] = useState(false)
  const [range, setRange] = useState<Range>(30)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    const since = addDays(today(), -150)
    const [s, t, c, tk, i, a] = await Promise.all([
      supabase.from('sales').select('*').gte('sold_at', since).order('sold_at').limit(5000),
      supabase.from('transactions').select('*'),
      supabase.from('customers').select('*'),
      supabase.from('tasks').select('*').eq('done', false).order('due_date', { nullsFirst: false }).limit(50),
      supabase.from('insights').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('approvals').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    ])
    setSales(((s.data ?? []) as Sale[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setTxs(((t.data ?? []) as Transaction[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setCustomers((c.data ?? []) as Customer[])
    setTasks((tk.data ?? []) as Task[])
    setInsights((i.data ?? []) as Insight[])
    setApprovals((a.data ?? []) as Approval[])
    setReady(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Tempo real: nova venda/insight atualiza os números e redesenha a linha
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('dash-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `company_id=eq.${company.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insights', filter: `company_id=eq.${company.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, load])

  const m = useMemo(() => {
    const t = today()
    const monthStart = t.slice(0, 8) + '01'
    const d = new Date()
    const prevStart = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    const prevSame = toISO(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()))
    const valid = sales.filter((s) => s.status !== 'cancelled')
    const sum = (a: { amount: number }[]) => a.reduce((x, y) => x + y.amount, 0)
    const month = valid.filter((s) => s.sold_at >= monthStart)
    const prev = valid.filter((s) => s.sold_at >= prevStart && s.sold_at <= prevSame)
    const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null)
    const revenue = sum(month)
    const ticket = month.length ? revenue / month.length : 0
    const prevTicket = prev.length ? sum(prev) / prev.length : 0

    const series: { label: string; value: number }[] = []
    for (let i = range - 1; i >= 0; i--) {
      const day = addDays(t, -i)
      series.push({ label: fmtDate(day).slice(0, 5), value: sum(valid.filter((s) => s.sold_at === day)) })
    }
    const half = Math.floor(series.length / 2)
    const growth = pct(
      series.slice(half).reduce((a, b) => a + b.value, 0),
      series.slice(0, half).reduce((a, b) => a + b.value, 0),
    )

    const open = txs.filter((x) => !x.paid_at)
    const payables = open.filter((x) => x.type === 'expense')
    const overdue = payables.filter((x) => x.due_date < t)

    const products = new Map<string, number>()
    for (const s of valid.filter((s) => s.sold_at >= addDays(t, -30))) products.set(s.description, (products.get(s.description) ?? 0) + s.amount)
    const prodSorted = [...products].sort((a, b) => b[1] - a[1])
    const top = prodSorted.slice(0, 4).map(([label, value]) => ({ label, value }))
    const rest = prodSorted.slice(4).reduce((a, b) => a + b[1], 0)
    if (rest > 0) top.push({ label: 'Outros', value: rest })

    // Entradas x saídas dos últimos 4 meses
    const months: { label: string; a: number; b: number }[] = []
    for (let k = 3; k >= 0; k--) {
      const first = new Date(d.getFullYear(), d.getMonth() - k, 1)
      const last = new Date(d.getFullYear(), d.getMonth() - k + 1, 0)
      const f = toISO(first)
      const l = toISO(last)
      const ins = sum(valid.filter((s) => s.sold_at >= f && s.sold_at <= l && s.status === 'paid')) + sum(txs.filter((x) => x.type === 'income' && x.paid_at && x.paid_at >= f && x.paid_at <= l))
      const outs = sum(txs.filter((x) => x.type === 'expense' && x.due_date >= f && x.due_date <= l))
      months.push({ label: first.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), a: ins, b: outs })
    }

    const newCustomers = customers.filter((c) => c.created_at.slice(0, 10) >= monthStart).length
    const prevCustomers = customers.filter((c) => c.created_at.slice(0, 10) < monthStart).length
    return {
      revenue,
      revenueDelta: pct(revenue, sum(prev)),
      count: month.length,
      ticket,
      ticketDelta: pct(ticket, prevTicket),
      series,
      seriesTotal: series.reduce((a, b) => a + b.value, 0),
      growth,
      payablesTotal: sum(payables),
      overdue,
      top,
      months,
      newCustomers,
      customersDelta: prevCustomers ? (newCustomers / prevCustomers) * 100 : null,
      tasksSoon: tasks.filter((x) => x.due_date && x.due_date <= addDays(t, 2)).slice(0, 5),
      recent: [...valid].sort((a, b) => (b.sold_at + b.created_at).localeCompare(a.sold_at + a.created_at)).slice(0, 6),
    }
  }, [sales, txs, customers, tasks, range])

  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])

  async function runAgents() {
    setRunning(true)
    try {
      const r = await api<{ ai: boolean; aiError: string | null; insights: number; tasks: number; approvals: number }>('analise')
      toast(`${AGENT_NAME} analisou a clínica: ${r.insights} notificações, ${r.tasks} tarefas novas${r.approvals ? ` e ${r.approvals} aprovação(ões)` : ''}`)
      if (r.aiError) toast(`Análise feita com regras (IA: ${r.aiError})`, 'err')
      await load()
      reloadCounts()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setRunning(false)
    }
  }

  const hello = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  })()
  const attention = [
    ...approvals.map((a) => ({ key: a.id, icon: CheckCircle2, text: a.title, sub: 'Aprovação pendente', to: '/aprovacoes', tone: 'bg-brand-soft text-brand' })),
    ...(dono ? m.overdue : []).map((x) => ({ key: x.id, icon: AlertTriangle, text: x.description, sub: `Venceu ${fmtDate(x.due_date)} · ${brl(x.amount)}`, to: '/financeiro', tone: 'bg-rose-50 text-rose-600' })),
    ...insights
      .filter((i) => i.priority === 'high' && !i.read)
      .map((i) => ({ key: i.id, icon: Sparkles, text: i.title, sub: `Alerta · ${areaOf(i.agent_kind).label}`, to: '/notificacoes', tone: 'bg-amber-50 text-amber-600' })),
  ].slice(0, 5)

  return (
    <div>
      {/* Saudação */}
      <Reveal className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
            {hello}, {company?.name}! <span className="inline-block">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Veja o que está acontecendo na sua clínica.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/agente" className="btn-ghost flex-1 sm:flex-none">
            <Sparkles size={16} className="text-brand-dark" /> Falar com a Coraline
          </Link>
          {dono && (
            <button className="btn-primary flex-1 sm:flex-none" onClick={runAgents} disabled={running}>
              {running ? <Spinner /> : <Play size={15} fill="currentColor" />} {running ? 'Analisando…' : 'Rodar análise'}
            </button>
          )}
        </div>
      </Reveal>

      <HojeNaAgenda />

      {papel === 'profissional' ? (
        <Reveal i={2} className="card p-5 text-sm text-muted sm:p-6">
          Use o menu para ver os <Link className="font-semibold text-ink underline underline-offset-2" to="/clientes">pacientes</Link>, as <Link className="font-semibold text-ink underline underline-offset-2" to="/tarefas">tarefas</Link> ou conversar com a <Link className="font-semibold text-ink underline underline-offset-2" to="/agente">Coraline</Link>.
        </Reveal>
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Reveal i={1} className="relative col-span-2 overflow-hidden rounded-[26px] bg-brand p-5 text-white shadow-[0_18px_40px_-18px_rgba(72,168,252,0.9)] sm:col-span-1 sm:p-6">
          <CoralineIcon flat size={128} className="pointer-events-none absolute -bottom-6 -right-4 rotate-12 opacity-[0.13]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <ShoppingBag size={17} />
              </span>
              Vendas no mês
            </div>
            <Link to="/vendas" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand">
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="relative mt-5 text-[30px] font-bold leading-none tracking-tight sm:text-[34px]">{ready ? <Money value={m.revenue} delay={250} /> : <span className="opacity-60">R$ —</span>}</div>
          <div className="relative mt-4 flex items-center gap-2 text-xs text-white/80">
            <Delta value={m.revenueDelta} onDark /> vs mês passado
          </div>
        </Reveal>
        <Kpi i={2} icon={<Wallet size={17} />} label="Ticket médio" to="/vendas" ready={ready} value={<Money value={m.ticket} delay={350} />} delta={<Delta value={m.ticketDelta} />} sub={<><Count value={m.count} delay={350} /> vendas</>} />
        <Kpi i={3} icon={<Users size={17} />} label="Pacientes" to="/clientes" ready={ready} value={<Count value={customers.length} delay={450} />} delta={<Delta value={m.customersDelta} />} sub={`+${m.newCustomers} novos`} />
        {dono && <Kpi
          wide
          i={4}
          icon={<CalendarClock size={17} />}
          label="Contas a pagar"
          to="/financeiro"
          ready={ready}
          value={<Money value={m.payablesTotal} delay={550} />}
          delta={m.overdue.length ? <span className="chip bg-rose-50 text-rose-600">{m.overdue.length} vencida(s)</span> : <span className="chip bg-emerald-50 text-emerald-600">em dia</span>}
          sub="em aberto"
        />}
      </div>

      {/* Curva de vendas + atenção */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <Reveal i={5} className="card p-5 sm:p-6 xl:col-span-2">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Desempenho de vendas</h2>
              <p className="text-xs text-muted">Vendas por dia nos últimos {range} dias</p>
            </div>
            <div className="flex rounded-full bg-panel-2 p-1 text-xs font-semibold">
              {([7, 30, 90] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3.5 py-1.5 transition ${range === r ? 'bg-panel text-ink shadow-sm' : 'text-muted'}`}>
                  {r} dias
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">{ready ? <LineChart data={m.series} delay={700} /> : <div className="skeleton h-[250px] w-full" />}</div>
            <div className="flex gap-6 md:w-40 md:flex-col md:gap-5 md:pb-8">
              <div>
                <div className="text-xs text-muted">Total no período</div>
                <div className="text-xl font-bold">{brlShort(m.seriesTotal)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Crescimento</div>
                <div className={`text-xl font-bold ${(m.growth ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {m.growth === null ? '—' : `${m.growth >= 0 ? '+' : ''}${m.growth.toFixed(0)}%`}
                </div>
                <div className="text-[11px] text-muted">2ª metade vs 1ª</div>
              </div>
            </div>
          </div>
          {ready && sales.length === 0 && (
            <p className="mt-2 text-center text-sm text-muted">
              Nenhuma venda ainda.{' '}
              <Link to="/vendas" className="font-semibold text-brand">
                Cadastre a primeira
              </Link>
            </p>
          )}
        </Reveal>

        <Reveal i={6} className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Precisa da sua atenção</h2>
            <span className="chip bg-rose-50 text-rose-600">{attention.length}</span>
          </div>
          {attention.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={22} />
              </div>
              <p className="text-sm font-semibold">Tudo em dia por aqui</p>
              <p className="text-xs text-muted">Nenhuma pendência urgente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attention.map((a, i) => (
                <Reveal key={a.key} i={i + 6} step={70}>
                  <Link to={a.to} className="flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-panel-2">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${a.tone}`}>
                      <a.icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.text}</span>
                      <span className="block truncate text-xs text-muted">{a.sub}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-muted" />
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </Reveal>
      </div>

      {/* Coraline */}
      <Reveal i={7} className="card mt-4 overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_1fr]">
          <div className="relative overflow-hidden bg-graphite p-6 text-white sm:p-7">
            <CoralineIcon flat size={176} className="pointer-events-none absolute -bottom-10 -right-6 rotate-12 opacity-[0.07]" />
            <div className="relative flex items-center gap-3">
              <AgentMark size={44} rounded="rounded-2xl" />
              <div>
                <div className="text-lg font-bold">{AGENT_NAME}</div>
                <div className="flex items-center gap-1.5 text-xs text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Vendas, marketing, financeiro, atendimento e gestão
                </div>
              </div>
            </div>
            <form
              className="relative mt-6 flex items-center gap-2 rounded-full bg-white/10 p-1.5 pl-5 focus-within:bg-white/15"
              onSubmit={(e) => {
                e.preventDefault()
                if (ask.trim()) navigate(`/agente?q=${encodeURIComponent(ask.trim())}`)
              }}
            >
              <input maxLength={8000} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45" placeholder="Pergunte qualquer coisa sobre a sua empresa…" value={ask} onChange={(e) => setAsk(e.target.value)} />
              <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-ink" aria-label="Perguntar">
                <ArrowUpRight size={18} />
              </button>
            </form>
          </div>
          <div className="flex flex-col gap-2 p-5 sm:p-6">
            <div className="mb-1 text-xs font-semibold text-muted">Comece por aqui</div>
            {SUGGESTIONS.slice(0, 4).map((sg) => {
              const a = areaOf(sg.area)
              return (
                <button key={sg.text} onClick={() => navigate(`/agente?q=${encodeURIComponent(sg.text)}`)} className="group flex items-center gap-3 rounded-2xl p-2.5 text-left text-sm transition hover:bg-panel-2">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${a.cls}`}>
                    <a.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{sg.text}</span>
                  <ChevronRight size={15} className="shrink-0 text-muted transition group-hover:translate-x-0.5" />
                </button>
              )
            })}
          </div>
        </div>
      </Reveal>

      {/* Produtos, entradas x saídas, tarefas */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Reveal i={13} className="card flex flex-col p-5 sm:p-6">
          <h2 className="text-lg font-bold">Vendas por produto</h2>
          <p className="mb-4 text-xs text-muted">Últimos 30 dias</p>
          {m.top.length ? (
            <div className="flex flex-1 items-center gap-5">
              <Donut data={m.top} size={156} delay={1100} center={{ value: brlShort(m.top.reduce((a, b) => a + b.value, 0)), label: 'total' }} />
              <ul className="min-w-0 flex-1 space-y-2.5">
                {m.top.map((p, i) => (
                  <li key={p.label} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    <span className="font-semibold">{brlShort(p.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">Sem vendas no período.</p>
          )}
        </Reveal>

        {dono && <Reveal i={14} className="card p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">Entradas x Saídas</h2>
              <p className="text-xs text-muted">Últimos 4 meses</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand" /> Entradas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ink" /> Saídas
              </span>
            </div>
          </div>
          <DualBars data={m.months} delay={1200} />
        </Reveal>}

        <Reveal i={15} className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Hoje e próximos dias</h2>
            <Link to="/tarefas" className="text-xs font-bold text-brand">
              Ver tarefas
            </Link>
          </div>
          {m.tasksSoon.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nenhuma tarefa próxima.</p>
          ) : (
            <ul className="space-y-2">
              {m.tasksSoon.map((t) => {
                const rel = relativeDay(t.due_date)
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-panel-2 p-3">
                    {(() => {
                      const a = areaOf(t.agent_kind)
                      return (
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${a.cls}`}>
                          <a.icon size={15} />
                        </span>
                      )
                    })()}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                    <span className={`chip ${rel === 'Atrasada' ? 'bg-rose-50 text-rose-600' : rel === 'Hoje' ? 'bg-brand text-ink' : 'bg-panel text-ink'}`}>{rel}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Reveal>
      </div>

      {/* Vendas recentes + últimas do agente */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <Reveal i={16} className="card p-5 sm:p-6 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Vendas recentes</h2>
            <Link to="/vendas" className="btn-ghost h-9 px-4 text-xs">
              Ver todas
            </Link>
          </div>
          {m.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nenhuma venda registrada.</p>
          ) : (
            <>
            <ul className="divide-y divide-line sm:hidden">
              {m.recent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
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
                    <span className={`text-[11px] font-semibold ${s.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{STATUS_LABEL[s.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="-mx-2 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-2 py-2 font-medium">Produto</th>
                    <th className="px-2 py-2 font-medium">Cliente</th>
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recent.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="px-2 py-3 font-semibold">{s.description}</td>
                      <td className="px-2 py-3 text-muted">{s.customer_id ? names.get(s.customer_id) : '—'}</td>
                      <td className="px-2 py-3 text-muted">{fmtDate(s.sold_at)}</td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums">{brl(s.amount)}</td>
                      <td className="px-2 py-3">
                        <span className={`chip ${STATUS_CHIP[s.status]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
                          {STATUS_LABEL[s.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Reveal>

        <Reveal i={17} className="card p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Alertas da Coraline</h2>
            <Link to="/notificacoes" className="text-xs font-bold text-brand">
              Ver todas
            </Link>
          </div>
          <div className="space-y-1">
            {insights.slice(0, 4).map((n) => (
              <Link key={n.id} to="/notificacoes" className="flex gap-3 rounded-2xl p-2.5 transition hover:bg-panel-2">
                <AgentMark size={36} rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{n.title}</span>
                  </div>
                  <AreaChip kind={n.agent_kind} className="mt-0.5" />
                  <p className="line-clamp-1 text-xs text-muted">{n.body}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.created_at)}</span>
              </Link>
            ))}
            {ready && insights.length === 0 && <p className="py-6 text-center text-sm text-muted">Clique em “Rodar análise”.</p>}
          </div>
        </Reveal>
      </div>
      </>
      )}
    </div>
  )
}

function Kpi({ i, icon, label, value, delta, sub, to, ready, wide }: { i: number; icon: ReactNode; label: string; value: ReactNode; delta: ReactNode; sub: ReactNode; to: string; ready: boolean; wide?: boolean }) {
  return (
    <Reveal i={i} className={`card p-4 sm:p-6 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-2 sm:flex">{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        <Link to={to} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line hover:bg-panel-2 sm:h-9 sm:w-9">
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="mt-4 truncate text-[22px] font-bold leading-none tracking-tight sm:mt-5 sm:text-[30px]">{ready ? value : <div className="skeleton h-8 w-28" />}</div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted sm:mt-4">
        {delta} <span>{sub}</span>
      </div>
    </Reveal>
  )
}
