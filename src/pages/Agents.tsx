import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, MessageSquareText, Pencil, Play } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Agent, Insight } from '../lib/types'
import { AGENT_META } from '../lib/agents'
import { AgentAvatar, PageHeader, Reveal, Spinner } from '../components/ui'
import EditAgent from '../components/EditAgent'
import { timeAgo } from '../lib/format'

export default function Agents() {
  const { agents, toast, reloadAgents, reloadCounts } = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Agent | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])

  const loadInsights = () =>
    supabase
      .from('insights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data }) => setInsights((data ?? []) as Insight[]))
  useEffect(() => {
    loadInsights()
  }, [])

  async function run(a: Agent) {
    setRunning(a.kind)
    try {
      const r = await api<{ results: { insights: number; tasks: number; approvals: number; aiError: string | null }[] }>('agents', { kind: a.kind })
      const x = r.results[0]
      toast(x ? `${a.name}: ${x.insights} notificações, ${x.tasks} tarefas novas` : `${a.name} está desativado`)
      if (x?.aiError) toast(x.aiError, 'err')
      await Promise.all([loadInsights(), reloadAgents(), reloadCounts()])
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setRunning(null)
    }
  }

  return (
    <div>
      <PageHeader title="Agentes de IA" subtitle="Seu time de IA trabalhando 24h. Toque em um agente para conversar com ele." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((a, i) => {
          const meta = AGENT_META[a.kind]
          const mine = insights.filter((x) => x.agent_kind === a.kind)
          return (
            <Reveal key={a.id} i={i + 1} className="card group relative flex cursor-pointer flex-col overflow-hidden p-6 transition hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(16,24,40,0.25)]" onClick={() => navigate(`/agentes/${a.kind}`)}>
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-[0.12]" style={{ background: meta.solid }} />
              <div className="relative flex items-start justify-between">
                <div className="relative">
                  <AgentAvatar agent={a} size={68} rounded="rounded-3xl" />
                  <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white ${a.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" onClick={() => setEditing(a)} title="Personalizar">
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn" disabled={!!running || !a.enabled} onClick={() => run(a)} title="Rodar análise agora">
                    {running === a.kind ? <Spinner size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>
              <h3 className="relative mt-4 text-xl font-bold">{a.name}</h3>
              <div className={`relative text-sm font-semibold ${meta.fg}`}>{meta.role}</div>
              <p className="relative mt-3 text-sm text-muted">{meta.desc}</p>
              <div className="relative mt-5 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-panel-2 p-3">
                  <div className="text-muted">Análises</div>
                  <div className="text-lg font-bold">{mine.length}</div>
                </div>
                <div className="rounded-2xl bg-panel-2 p-3">
                  <div className="text-muted">Última análise</div>
                  <div className="truncate text-sm font-bold">{a.last_run_at ? timeAgo(a.last_run_at) : 'nunca'}</div>
                </div>
              </div>
              {mine[0] && (
                <div className="relative mt-3 rounded-2xl border border-line p-3">
                  <div className="text-xs font-bold">{mine[0].title}</div>
                  <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted">{mine[0].body}</div>
                </div>
              )}
              <div className="relative mt-auto pt-5">
                <span className="btn-primary w-full">
                  <MessageSquareText size={16} /> Conversar com {a.name}
                  <ArrowUpRight size={16} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Reveal>
          )
        })}
      </div>
      {editing && <EditAgent agent={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
