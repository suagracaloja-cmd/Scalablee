import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowUp, CheckCircle2, ChevronRight, Package, Play } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Approval, Insight, Task, Transaction } from '../lib/types'
import { addDays, brl, fmtDate, plural, relativeDay, timeAgo, toISO, today } from '../lib/format'
import { AgentMark, Ajusta, Count, Delta, Money, Orb, Reveal, Spinner, STATUS_DOT, STATUS_LABEL } from '../components/ui'
import { DualBars, LineChart } from '../components/LineChart'
import { AGENT_NAME, SUGGESTIONS, areaOf } from '../lib/areas'
import { HojeNaAgenda } from '../components/HojeNaAgenda'
import { normalizarItem, situacao, type ItemEstoque } from '../lib/estoque'
import { useTempoReal } from '../hooks/useTempoReal'
import { painelAtendimentos, type Painel } from '../lib/atendimentos'

type Range = 7 | 30 | 90

export default function Dashboard() {
  const { company, papel, toast, reloadCounts } = useApp()
  const dono = papel === 'dono'
  const [ask, setAsk] = useState('')
  const navigate = useNavigate()
  // Atendimentos já somados no banco: totais por dia e situação, mais vendidos (30 dias) e os 6 mais recentes
  const [painel, setPainel] = useState<Painel>({ dias: [], produtos: [], recentes: [] })
  const [txs, setTxs] = useState<Transaction[]>([])
  // Pacientes: só as contagens e os nomes que aparecem na tela (antes baixava a lista inteira)
  const [clientes, setClientes] = useState<{ total: number; novosMes: number }>({ total: 0, novosMes: 0 })
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [tasks, setTasks] = useState<Task[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [estoque, setEstoque] = useState<ItemEstoque[]>([])
  const [ready, setReady] = useState(false)
  const [range, setRange] = useState<Range>(30)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    const since = addDays(today(), -185) // período atual + o anterior (para comparar até na faixa de 90 dias)
    const d = new Date()
    const mesAtual = today().slice(0, 8) + '01'
    // Lançamentos: os em aberto e os dos últimos 4 meses (é o que os cartões e o gráfico usam)
    const desde4Meses = toISO(new Date(d.getFullYear(), d.getMonth() - 3, 1))
    const [s, t, c, cNovos, tk, i, a, es] = await Promise.all([
      painelAtendimentos(since, addDays(today(), -30)).catch(() => ({ dias: [], produtos: [], recentes: [] }) as Painel),
      supabase.from('transactions').select('id,type,description,amount,due_date,paid_at').or(`paid_at.is.null,due_date.gte.${desde4Meses},paid_at.gte.${desde4Meses}`),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', mesAtual),
      supabase.from('tasks').select('*').eq('done', false).order('due_date', { nullsFirst: false }).limit(50),
      supabase.from('insights').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('approvals').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('estoque_itens').select('*').eq('ativo', true).limit(2000),
    ])
    const pa = s
    setPainel(pa)
    setTxs(((t.data ?? []) as Transaction[]).map((x) => ({ ...x, amount: Number(x.amount) })))
    setClientes({ total: c.count ?? 0, novosMes: cNovos.count ?? 0 })
    // Nomes dos atendimentos recentes (já vêm junto, do banco)
    setNames(new Map(pa.recentes.filter((x) => x.customer_id && x.paciente).map((x) => [x.customer_id as string, x.paciente as string])))
    setTasks((tk.data ?? []) as Task[])
    setInsights((i.data ?? []) as Insight[])
    setApprovals((a.data ?? []) as Approval[])
    setEstoque(((es.data ?? []) as ItemEstoque[]).map(normalizarItem))
    setReady(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Tempo real: nova venda/insight atualiza os números e redesenha a linha (eventos seguidos = uma recarga)
  const filtro = `company_id=eq.${company?.id}`
  useTempoReal(company ? 'dash-' + company.id : null, [{ tabela: 'sales', filtro }, { tabela: 'insights', filtro }, { tabela: 'approvals', filtro }, { tabela: 'estoque_itens', filtro }], () => load())

  const m = useMemo(() => {
    const t = today()
    const monthStart = t.slice(0, 8) + '01'
    const d = new Date()
    const prevStart = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    const prevSame = toISO(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()))
    // Mesmas contas de antes, agora sobre os totais por dia (cada linha = um dia e uma situação)
    const valid = painel.dias.filter((s) => s.status !== 'cancelled')
    const sum = (a: { total: number }[]) => a.reduce((x, y) => x + y.total, 0)
    const qtd = (a: { qtd: number }[]) => a.reduce((x, y) => x + y.qtd, 0)
    const sumTx = (a: { amount: number }[]) => a.reduce((x, y) => x + y.amount, 0)
    const month = valid.filter((s) => s.dia >= monthStart)
    const prev = valid.filter((s) => s.dia >= prevStart && s.dia <= prevSame)
    const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null)
    const revenue = sum(month)
    const ticket = qtd(month) ? revenue / qtd(month) : 0
    const prevTicket = qtd(prev) ? sum(prev) / qtd(prev) : 0

    // Faturamento por dia no período escolhido e, para comparar, no mesmo número de dias antes dele
    const porDia = new Map<string, number>()
    for (const x of valid) porDia.set(x.dia, (porDia.get(x.dia) ?? 0) + x.total)
    const series: { label: string; value: number }[] = []
    const anterior: number[] = []
    for (let i = range - 1; i >= 0; i--) {
      const day = addDays(t, -i)
      series.push({ label: fmtDate(day).slice(0, 5), value: porDia.get(day) ?? 0 })
      anterior.push(porDia.get(addDays(t, -i - range)) ?? 0)
    }
    const totalAnterior = anterior.reduce((a, b) => a + b, 0)
    const acumula = (v: number[]) => v.reduce<number[]>((acc, x) => [...acc, (acc[acc.length - 1] ?? 0) + x], [])
    const acumulado = acumula(series.map((x) => x.value))
    const acumuladoAnterior = acumula(anterior)
    const growth = totalAnterior ? pct(series.reduce((a, b) => a + b.value, 0), totalAnterior) : null

    const open = txs.filter((x) => !x.paid_at)
    const payables = open.filter((x) => x.type === 'expense')
    const overdue = payables.filter((x) => x.due_date < t)

    const prodSorted = painel.produtos.map((p) => [p.descricao, p.total] as [string, number]).sort((a, b) => b[1] - a[1])
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
      const ins = sum(valid.filter((s) => s.dia >= f && s.dia <= l && s.status === 'paid')) + sumTx(txs.filter((x) => x.type === 'income' && x.paid_at && x.paid_at >= f && x.paid_at <= l))
      const outs = sumTx(txs.filter((x) => x.type === 'expense' && x.due_date >= f && x.due_date <= l))
      months.push({ label: first.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), a: ins, b: outs })
    }

    const newCustomers = clientes.novosMes
    const prevCustomers = clientes.total - clientes.novosMes
    return {
      revenue,
      revenueDelta: pct(revenue, sum(prev)),
      count: qtd(month),
      ticket,
      ticketDelta: pct(ticket, prevTicket),
      series,
      anterior,
      acumulado,
      acumuladoAnterior,
      seriesTotal: series.reduce((a, b) => a + b.value, 0),
      growth,
      payablesTotal: sumTx(payables),
      overdue,
      top,
      months,
      newCustomers,
      customersDelta: prevCustomers ? (newCustomers / prevCustomers) * 100 : null,
      tasksSoon: tasks.filter((x) => x.due_date && x.due_date <= addDays(t, 2)).slice(0, 5),
      recent: painel.recentes,
    }
  }, [painel, txs, clientes, tasks, range])


  async function runAgents() {
    setRunning(true)
    try {
      const r = await api<{ ai: boolean; aiError: string | null; insights: number; tasks: number; approvals: number }>('analise')
      toast(`${AGENT_NAME} analisou a clínica: ${r.insights} notificações, ${r.tasks} tarefas novas${r.approvals ? ` e ${plural(r.approvals, 'aprovação', 'aprovações')}` : ''}`)
      if (r.aiError) toast(`Análise feita com regras (IA: ${r.aiError})`, 'err')
      await load()
      reloadCounts()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setRunning(false)
    }
  }

  const hoje = (() => {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return t.charAt(0).toUpperCase() + t.slice(1)
  })()
  // Estoque: um aviso para o que venceu e outro para o que está acabando
  const avisosEstoque = (() => {
    const t = today()
    const lista = (f: (x: ReturnType<typeof situacao>) => boolean) => estoque.filter((i) => f(situacao(i, t))).map((i) => i.nome)
    const resumo = (nomes: string[]) => (nomes.length <= 2 ? nomes.join(' e ') : `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`)
    const vencidos = lista((x) => x.validade === 'vencido')
    const acabando = lista((x) => x.nivel !== 'ok')
    return [
      ...(vencidos.length ? [{ key: 'estoque-vencido', icon: Package, text: `${plural(vencidos.length, 'item vencido', 'itens vencidos')} no estoque`, sub: resumo(vencidos), to: '/estoque', dot: 'bg-rose-500' }] : []),
      ...(acabando.length ? [{ key: 'estoque-acabando', icon: Package, text: `${plural(acabando.length, 'item acabando', 'itens acabando')} no estoque`, sub: resumo(acabando), to: '/estoque', dot: 'bg-amber-500' }] : []),
    ]
  })()
  const principais = [
    ...approvals.map((a) => ({ key: a.id, icon: CheckCircle2, text: a.title, sub: 'Aprovação pendente', to: '/aprovacoes', dot: 'bg-brand' })),
    ...(dono ? m.overdue : []).map((x) => ({ key: x.id, icon: AlertTriangle, text: x.description, sub: `Venceu ${fmtDate(x.due_date)} · ${brl(x.amount)}`, to: '/financeiro', dot: 'bg-rose-500' })),
  ]
  // Os avisos do estoque (no máximo 2) sempre aparecem, mesmo com muitas pendências
  const attention = [
    ...principais.slice(0, 5 - avisosEstoque.length),
    ...avisosEstoque,
    ...insights
      .filter((i) => i.priority === 'high' && !i.read)
      .map((i) => ({ key: i.id, icon: areaOf(i.agent_kind).icon, text: i.title, sub: `Alerta · ${areaOf(i.agent_kind).label}`, to: '/notificacoes', dot: 'bg-amber-500' })),
  ].slice(0, 5)

  const totalProcedimentos = m.top.reduce((a, b) => a + b.value, 0)
  const maiorProcedimento = Math.max(1, ...m.top.map((p) => p.value))

  return (
    <div>
      <Reveal className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">{company?.name ?? 'Início'}</h1>
          <p className="mt-1 text-sm text-secondary">{hoje}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/agente" className="btn-ghost flex-1 pl-2.5 sm:flex-none">
            <Orb size={22} /> <span className="sm:hidden">{AGENT_NAME}</span>
            <span className="hidden sm:inline">Falar com a {AGENT_NAME}</span>
          </Link>
          {dono && (
            <button className="btn-primary flex-1 sm:flex-none" onClick={runAgents} disabled={running}>
              {running ? <Spinner /> : <Play size={14} strokeWidth={1.75} />} {running ? 'Analisando…' : 'Rodar análise'}
            </button>
          )}
        </div>
      </Reveal>

      <HojeNaAgenda />

      {papel === 'profissional' ? (
        <Reveal i={2} className="card p-5 text-sm text-secondary sm:p-6">
          Use o menu para ver os <Link className="font-medium text-ink underline underline-offset-2" to="/clientes">pacientes</Link>, as <Link className="font-medium text-ink underline underline-offset-2" to="/tarefas">tarefas</Link> ou conversar com a <Link className="font-medium text-ink underline underline-offset-2" to="/agente">Coraline AI</Link>.
        </Reveal>
      ) : (
      <>
      {/* Números do mês */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi i={1} label="Faturamento no mês" to="/atendimentos" ready={ready} value={<Money value={m.revenue} />} wide
          sub={<><Delta value={m.revenueDelta} /> <span>vs mês passado</span></>} />
        <Kpi i={2} label="Ticket médio" to="/atendimentos" ready={ready} value={<Money value={m.ticket} />}
          sub={<><Delta value={m.ticketDelta} /> <span>vs mês passado · <Count value={m.count} /> {m.count === 1 ? 'atendimento' : 'atendimentos'}</span></>} />
        <Kpi i={3} label="Pacientes" to="/clientes" ready={ready} value={<Count value={clientes.total} />}
          sub={<span>{m.newCustomers === 0 ? 'Nenhum novo neste mês' : `+${m.newCustomers} ${m.newCustomers === 1 ? 'novo' : 'novos'} neste mês`}</span>} />
        {dono && <Kpi
          i={4}
          label="Contas a pagar"
          to="/financeiro"
          ready={ready}
          value={<Money value={m.payablesTotal} />}
          sub={m.overdue.length ? <span className="font-medium text-rose-700">{m.overdue.length} {m.overdue.length === 1 ? 'vencida' : 'vencidas'}</span> : <span>Em aberto, nada vencido</span>}
        />}
      </div>

      {/* Faturamento por dia + o que precisa de atenção */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <Reveal i={5} className="card p-5 sm:p-6 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Faturamento</h2>
              <p className="text-sm text-muted">Acumulado nos últimos {range} dias, comparado aos {range} dias anteriores</p>
            </div>
            <div className="flex rounded-ctl bg-panel-2 p-0.5 text-xs font-medium" role="group" aria-label="Período do gráfico">
              {([7, 30, 90] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={`transicao h-7 rounded-md px-3 ${range === r ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] ring-1 ring-line' : 'text-secondary hover:text-ink'}`}>
                  {r} dias
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-xs text-muted">Total no período</div>
              <div className="mt-1 text-[22px] font-medium leading-none tabular-nums">{brl(m.seriesTotal)}</div>
            </div>
            <div className="text-sm text-secondary">
              {m.growth === null ? 'Sem período anterior para comparar' : <><Delta value={m.growth} /> vs os {range} dias anteriores</>}
            </div>
            <div className="ml-auto flex items-center gap-4 text-xs text-secondary">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-brand-dark" /> Este período</span>
              <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-[1.5px] border-dashed border-slate-400" /> Anterior</span>
            </div>
          </div>
          {ready ? <LineChart data={m.series.map((x, k) => ({ label: x.label, value: m.acumulado[k] }))} anterior={m.acumuladoAnterior} diario={m.series.map((x) => x.value)} /> : <div className="skeleton h-[260px] w-full" />}
          {ready && painel.dias.length === 0 && (
            <p className="mt-2 text-center text-sm text-muted">
              Nenhum atendimento ainda.{' '}
              <Link to="/atendimentos" className="font-medium text-brand-ink hover:underline">
                Cadastre o primeiro
              </Link>
            </p>
          )}
        </Reveal>

        <Reveal i={6} className="card p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Precisa da sua atenção</h2>
            <span className="text-sm tabular-nums text-muted">{attention.length}</span>
          </div>
          {attention.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 size={22} strokeWidth={1.5} className="mb-2 text-emerald-600" />
              <p className="text-sm font-medium">Tudo em dia</p>
              <p className="text-sm text-muted">Nenhuma pendência urgente</p>
            </div>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {attention.map((a) => (
                <li key={a.key}>
                  <Link to={a.to} className="transicao flex items-center gap-3 rounded-ctl px-2 py-2 hover:bg-panel-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-line bg-panel text-secondary">
                      <a.icon size={16} strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.text}</span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} aria-hidden="true" /> {a.sub}
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>

      {/* Coraline AI */}
      <Reveal i={7} className="card mt-4 overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col justify-center border-b border-line p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <AgentMark size={40} />
              <div>
                <div className="text-base font-semibold">{AGENT_NAME}</div>
                <div className="text-sm text-muted">Agenda, pacientes, financeiro, WhatsApp e gestão</div>
              </div>
            </div>
            <form
              className="relative mt-5 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (ask.trim()) navigate(`/agente?q=${encodeURIComponent(ask.trim())}`)
              }}
            >
              <input maxLength={8000} className="input h-11 pr-12" placeholder="Pergunte sobre a sua clínica" aria-label={`Perguntar à ${AGENT_NAME}`} value={ask} onChange={(e) => setAsk(e.target.value)} />
              <button className="btn-primary absolute right-1 h-9 w-9 px-0" aria-label="Perguntar">
                <ArrowUp size={16} strokeWidth={1.75} />
              </button>
            </form>
          </div>
          <div className="flex flex-col gap-0.5 p-3 sm:p-4">
            <div className="mb-1 px-2 pt-1 text-xs text-muted">Comece por aqui</div>
            {SUGGESTIONS.slice(0, 4).map((sg) => {
              const a = areaOf(sg.area)
              return (
                <button key={sg.text} onClick={() => navigate(`/agente?q=${encodeURIComponent(sg.text)}`)} className="transicao flex items-center gap-3 rounded-ctl px-2 py-2 text-left text-sm hover:bg-panel-2">
                  <a.icon size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">{sg.text}</span>
                  <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
                </button>
              )
            })}
          </div>
        </div>
      </Reveal>

      {/* Procedimentos, entradas x saídas, tarefas */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Reveal i={8} className="card flex flex-col p-5 sm:p-6">
          <h2 className="text-base font-semibold">Por procedimento</h2>
          <p className="mb-4 text-sm text-muted">Últimos 30 dias{totalProcedimentos ? ` · ${brl(totalProcedimentos)}` : ''}</p>
          {m.top.length ? (
            <ul className="space-y-3">
              {m.top.map((p, i) => (
                <li key={p.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{p.label}</span>
                    <span className="shrink-0 tabular-nums text-secondary">{brl(p.value)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-panel-2">
                    <div className={`h-full rounded-full ${i === 0 ? 'bg-brand-dark' : 'bg-slate-300'}`} style={{ width: `${Math.max(2, (p.value / maiorProcedimento) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted">Sem atendimentos no período</p>
          )}
        </Reveal>

        {dono && <Reveal i={9} className="card p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Entradas e saídas</h2>
              <p className="text-sm text-muted">Últimos 4 meses</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-secondary">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-brand-dark" /> Entradas</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-slate-300" /> Saídas</span>
            </div>
          </div>
          <DualBars data={m.months} />
        </Reveal>}

        <Reveal i={10} className="card p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Hoje e próximos dias</h2>
            <Link to="/tarefas" className="text-sm font-medium text-brand-ink hover:underline">
              Ver tarefas
            </Link>
          </div>
          {m.tasksSoon.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nenhuma tarefa próxima</p>
          ) : (
            <ul className="divide-y divide-line">
              {m.tasksSoon.map((t) => {
                const rel = relativeDay(t.due_date)
                const a = areaOf(t.agent_kind)
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <a.icon size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className={`shrink-0 text-xs font-medium ${rel === 'Atrasada' ? 'text-rose-700' : rel === 'Hoje' ? 'text-brand-ink' : 'text-muted'}`}>{rel}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Reveal>
      </div>

      {/* Atendimentos recentes + alertas */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <Reveal i={11} className="card p-5 sm:p-6 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Atendimentos recentes</h2>
            <Link to="/atendimentos" className="text-sm font-medium text-brand-ink hover:underline">
              Ver todos
            </Link>
          </div>
          {m.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nenhum atendimento registrado</p>
          ) : (
            <>
            <ul className="divide-y divide-line sm:hidden">
              {m.recent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.description}</span>
                    <span className="block truncate text-xs text-muted">
                      {fmtDate(s.sold_at)} · {s.customer_id ? names.get(s.customer_id) : 'Sem paciente'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-medium tabular-nums">{brl(s.amount)}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-secondary"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />{STATUS_LABEL[s.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="-mx-2 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-2 py-2 font-normal">Procedimento</th>
                    <th className="px-2 py-2 font-normal">Paciente</th>
                    <th className="px-2 py-2 font-normal">Data</th>
                    <th className="px-2 py-2 text-right font-normal">Valor</th>
                    <th className="px-2 py-2 font-normal">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recent.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="px-2 py-3 font-medium">{s.description}</td>
                      <td className="px-2 py-3 text-secondary">{s.customer_id ? names.get(s.customer_id) : '—'}</td>
                      <td className="px-2 py-3 tabular-nums text-secondary">{fmtDate(s.sold_at)}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{brl(s.amount)}</td>
                      <td className="px-2 py-3">
                        <span className="inline-flex items-center gap-1.5 text-secondary">
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

        <Reveal i={12} className="card p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Alertas da Coraline AI</h2>
            <Link to="/notificacoes" className="text-sm font-medium text-brand-ink hover:underline">
              Ver todos
            </Link>
          </div>
          <ul className="-mx-2 space-y-0.5">
            {insights.slice(0, 4).map((n) => {
              const a = areaOf(n.agent_kind)
              return (
                <li key={n.id}>
                  <Link to="/notificacoes" className="transicao flex gap-3 rounded-ctl px-2 py-2 hover:bg-panel-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-line bg-panel text-secondary">
                      <a.icon size={16} strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      <span className="line-clamp-1 text-xs text-muted">{a.label} · {n.body}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{timeAgo(n.created_at)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {ready && insights.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhum alerta ainda. Rode a análise para a {AGENT_NAME} revisar a clínica</p>}
        </Reveal>
      </div>
      </>
      )}
    </div>
  )
}

function Kpi({ i, label, value, sub, to, ready, wide }: { i: number; label: string; value: ReactNode; sub: ReactNode; to: string; ready: boolean; wide?: boolean }) {
  // O cartão inteiro abre a tela (fica fácil tocar no celular)
  return (
    <Reveal i={i} className={`card transicao hover:border-slate-300 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <Link to={to} className="group block rounded-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5">
        <div className="flex items-center justify-between gap-2 text-sm text-secondary">
          <span className="truncate">{label}</span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-muted opacity-0 transicao group-hover:opacity-100" />
        </div>
        {ready ? <Ajusta className="mt-3 py-0.5 text-[24px] font-medium leading-none tabular-nums sm:text-[28px]">{value}</Ajusta> : <div className="skeleton mt-3 h-7 w-28" />}
        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">{sub}</div>
      </Link>
    </Reveal>
  )
}
