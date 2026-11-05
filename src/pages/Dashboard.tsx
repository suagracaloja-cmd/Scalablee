import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bot, CalendarClock, CheckCircle2, MessageCircle, Play, Sparkles, Users, Wallet } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Approval, Customer, Insight, Sale, Task, Transaction } from '../lib/types'
import { addDays, brl, fmtDate, relativeDay, timeAgo, toISO, today } from '../lib/format'
import { AgentAvatar, Count, Money, Reveal, Spinner, STATUS_CHIP, STATUS_LABEL } from '../components/ui'
import { LineChart, Bars } from '../components/LineChart'
import { AGENT_META } from '../lib/agents'

type Range = 7 | 30 | 90

export default function Dashboard() {
  const { company, agents, agentByKind, toast, reloadCounts } = useApp()
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
    const since = addDays(today(), -120)
    const [s, t, c, tk, i, a] = await Promise.all([
      supabase.from('sales').select('*').gte('sold_at', since).order('sold_at'),
      supabase.from('transactions').select('*'),
      supabase.from('customers').select('*'),
      supabase.from('tasks').select('*').eq('done', false).order('due_date', { nullsFirst: false }).limit(50),
      supabase.from('insights').select('*').order('created_at', { ascending: false }).limit(12),
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

  // Tempo real: novas vendas/insights atualizam o dashboard (números sobem e a linha redesenha)
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
    const revenue = sum(month)
    const growth = sum(prev) ? ((revenue - sum(prev)) / sum(prev)) * 100 : null

    const series: { label: string; value: number }[] = []
    for (let i = range - 1; i >= 0; i--) {
      const day = addDays(t, -i)
      series.push({ label: fmtDate(day).slice(0, 5), value: sum(valid.filter((s) => s.sold_at === day)) })
    }
    const open = txs.filter((x) => !x.paid_at)
    const payables = open.filter((x) => x.type === 'expense')
    const receivables = open.filter((x) => x.type === 'income')
    const overdue = payables.filter((x) => x.due_date < t)
    const in7 = addDays(t, 7)

    const products = new Map<string, number>()
    for (const s of valid.filter((s) => s.sold_at >= addDays(t, -30))) products.set(s.description, (products.get(s.description) ?? 0) + s.amount)
    const top = [...products].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }))

    const newCustomers = customers.filter((c) => c.created_at.slice(0, 10) >= monthStart).length
    return {
      revenue,
      growth,
      count: month.length,
      ticket: month.length ? revenue / month.length : 0,
      series,
      payablesTotal: sum(payables),
      payablesSoon: payables.filter((x) => x.due_date <= in7).sort((a, b) => a.due_date.localeCompare(b.due_date)),
      overdue,
      receivablesTotal: sum(receivables),
      top,
      newCustomers,
      tasksSoon: tasks.filter((x) => x.due_date && x.due_date <= addDays(t, 2)).slice(0, 6),
    }
  }, [sales, txs, customers, tasks, range])

  async function runAgents() {
    setRunning(true)
    try {
      const r = await api<{ ai: boolean; results: { kind: string; insights: number; tasks: number; approvals: number; aiError: string | null }[] }>('agents')
      const n = r.results.reduce((a, b) => a + b.insights, 0)
      const tk = r.results.reduce((a, b) => a + b.tasks, 0)
      toast(`Agentes concluíram: ${n} notificações e ${tk} tarefas novas${r.ai ? '' : ' (modo básico, sem chave de IA)'}`)
      const err = r.results.find((x) => x.aiError)
      if (err) toast(`IA (${err.kind}): ${err.aiError}`, 'err')
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
    ...approvals.map((a) => ({ key: a.id, icon: CheckCircle2, text: a.title, to: '/aprovacoes', tone: 'text-violet-300' })),
    ...m.overdue.map((x) => ({ key: x.id, icon: AlertTriangle, text: `Conta vencida: ${x.description} (${brl(x.amount)})`, to: '/financeiro', tone: 'text-rose-300' })),
    ...insights.filter((i) => i.priority === 'high' && !i.read).map((i) => ({ key: i.id, icon: Sparkles, text: i.title, to: '/notificacoes', tone: 'text-amber-300' })),
  ].slice(0, 6)

  return (
    <div>
      <Reveal className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{hello} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{company?.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/assistente" className="btn-ghost">
            <Sparkles size={16} /> Perguntar à IA
          </Link>
          <button className="btn-primary" onClick={runAgents} disabled={running}>
            {running ? <Spinner /> : <Play size={16} />} {running ? 'Agentes analisando…' : 'Rodar análise'}
          </button>
        </div>
      </Reveal>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          {
            label: 'Vendas no mês',
            node: <Money value={m.revenue} delay={200} />,
            sub:
              m.growth === null ? (
                <span className="text-muted">{m.count} vendas</span>
              ) : (
                <span className={m.growth >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {m.growth >= 0 ? <ArrowUpRight size={14} className="inline" /> : <ArrowDownRight size={14} className="inline" />} {Math.abs(m.growth).toFixed(0)}% vs mês passado
                </span>
              ),
            icon: ArrowUpRight,
          },
          { label: 'Ticket médio', node: <Money value={m.ticket} delay={300} />, sub: <span className="text-muted"><Count value={m.count} delay={300} /> vendas no mês</span>, icon: Wallet },
          { label: 'Clientes', node: <Count value={customers.length} delay={400} />, sub: <span className="text-emerald-300">+{m.newCustomers} novos este mês</span>, icon: Users },
          {
            label: 'Contas a pagar',
            node: <Money value={m.payablesTotal} delay={500} />,
            sub: m.overdue.length ? <span className="text-rose-300">{m.overdue.length} vencida(s)</span> : <span className="text-muted">A receber: {brl(m.receivablesTotal)}</span>,
            icon: CalendarClock,
          },
        ].map((k, i) => (
          <Reveal key={k.label} i={i + 1} className="card p-4 sm:p-5">
            <div className="flex items-center justify-between text-xs text-muted">
              {k.label}
              <k.icon size={16} />
            </div>
            <div className="mt-2 truncate text-xl font-bold sm:text-2xl">{ready ? k.node : <div className="skeleton h-7 w-24" />}</div>
            <div className="mt-1 truncate text-xs">{k.sub}</div>
          </Reveal>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Gráfico de vendas */}
        <Reveal i={5} className="card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Vendas por dia</h2>
              <p className="text-xs text-muted">Total no período: {brl(m.series.reduce((a, b) => a + b.value, 0))}</p>
            </div>
            <div className="flex rounded-xl border border-line bg-panel-2 p-1 text-xs">
              {([7, 30, 90] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-2.5 py-1 ${range === r ? 'bg-brand text-white' : 'text-muted'}`}>
                  {r}d
                </button>
              ))}
            </div>
          </div>
          {ready ? <LineChart data={m.series} delay={700} /> : <div className="skeleton h-60 w-full" />}
          {ready && sales.length === 0 && (
            <p className="mt-2 text-center text-sm text-muted">
              Nenhuma venda ainda. <Link to="/vendas" className="text-violet-300">Cadastre a primeira</Link>
            </p>
          )}
        </Reveal>

        {/* Precisa da sua atenção */}
        <Reveal i={6} className="card p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Precisa da sua atenção</h2>
          {attention.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Tudo em dia por aqui ✨</p>
          ) : (
            <ul className="space-y-2">
              {attention.map((a, i) => (
                <Reveal key={a.key} i={i} step={70} className="">
                  <Link to={a.to} className="flex items-start gap-3 rounded-xl bg-panel-2 p-3 text-sm hover:bg-line/60">
                    <a.icon size={16} className={`mt-0.5 shrink-0 ${a.tone}`} />
                    <span className="line-clamp-2">{a.text}</span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          )}
        </Reveal>
      </div>

      {/* Agentes */}
      <Reveal i={7} className="mt-4 card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Bot size={18} /> Seus agentes
          </h2>
          <Link to="/agentes" className="text-xs text-violet-300">
            Gerenciar
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible">
          {agents.map((a, i) => {
            const last = insights.find((x) => x.agent_kind === a.kind)
            return (
              <Reveal key={a.id} i={8 + i} step={80} className="min-w-[220px] rounded-xl border border-line bg-panel-2 p-3 sm:min-w-0">
                <div className="flex items-center gap-2.5">
                  <AgentAvatar agent={a} size={38} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{a.name}</div>
                    <div className={`chip ${AGENT_META[a.kind].color}`}>{AGENT_META[a.kind].label}</div>
                  </div>
                  <span className={`ml-auto h-2 w-2 rounded-full ${a.enabled ? 'bg-emerald-400 pulse-dot' : 'bg-slate-600'}`} />
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted">{last ? last.title : a.last_run_at ? 'Nada novo por enquanto' : 'Clique em "Rodar análise"'}</p>
              </Reveal>
            )
          })}
        </div>
      </Reveal>

      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* Feed de notificações */}
        <Reveal i={13} className="card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Últimas dos agentes</h2>
            <Link to="/notificacoes" className="text-xs text-violet-300">
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {insights.slice(0, 5).map((n, i) => (
              <Reveal key={n.id} i={i} step={80} className="flex gap-3 rounded-xl bg-panel-2 p-3">
                <AgentAvatar agent={n.agent_kind !== 'assistant' ? agentByKind(n.agent_kind) : undefined} kind={n.agent_kind} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{n.title}</span>
                    {n.priority === 'high' && <span className={`chip ${STATUS_CHIP.high}`}>{STATUS_LABEL.high}</span>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted">{n.body}</p>
                  <p className="mt-1 text-[10px] text-muted">{timeAgo(n.created_at)}</p>
                </div>
              </Reveal>
            ))}
            {ready && insights.length === 0 && <p className="py-6 text-center text-sm text-muted">Sem notificações ainda.</p>}
          </div>
        </Reveal>

        <div className="space-y-4">
          {/* Tarefas próximas */}
          <Reveal i={14} className="card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Hoje e próximos dias</h2>
              <Link to="/tarefas" className="text-xs text-violet-300">
                Tarefas
              </Link>
            </div>
            {m.tasksSoon.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Nenhuma tarefa próxima.</p>
            ) : (
              <ul className="space-y-2">
                {m.tasksSoon.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className={`chip ${relativeDay(t.due_date) === 'Atrasada' ? STATUS_CHIP.high : 'bg-panel-2 text-muted'}`}>{relativeDay(t.due_date)}</span>
                    <span className="truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
          {/* Mais vendidos */}
          <Reveal i={15} className="card p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Mais vendidos (30 dias)</h2>
            {m.top.length ? <Bars data={m.top} delay={1500} /> : <p className="py-4 text-center text-sm text-muted">Sem vendas no período.</p>}
          </Reveal>
          <Reveal i={16} className="card flex items-center gap-3 p-4">
            <MessageCircle className="text-emerald-300" />
            <div className="flex-1 text-sm">
              <div className="font-semibold">WhatsApp Business</div>
              <div className="text-xs text-muted">Atendimento automático pela IA</div>
            </div>
            <Link to="/whatsapp" className="btn-ghost px-3 py-1.5 text-xs">
              Abrir
            </Link>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
