import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Info, Pencil, Play, X } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { AgentKind, Insight } from '../lib/types'
import { AGENT_META } from '../lib/agents'
import { timeAgo } from '../lib/format'
import { ChatView } from '../components/Chat'
import EditAgent from '../components/EditAgent'
import { AgentAvatar, Reveal, Spinner } from '../components/ui'

const KINDS: AgentKind[] = ['marketing', 'sales', 'finance', 'crm', 'support']

export default function AgentChat() {
  const { kind } = useParams()
  const { agentByKind, agents, toast, reloadAgents, reloadCounts } = useApp()
  const [insights, setInsights] = useState<Insight[]>([])
  const [running, setRunning] = useState(false)
  const [editing, setEditing] = useState(false)
  const [info, setInfo] = useState(false)
  const k = KINDS.includes(kind as AgentKind) ? (kind as AgentKind) : null
  const agent = k ? agentByKind(k) : undefined

  const load = () => {
    if (!k) return
    supabase
      .from('insights')
      .select('*')
      .eq('agent_kind', k)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setInsights((data ?? []) as Insight[]))
  }
  useEffect(load, [k])

  if (!k) return <Navigate to="/agentes" replace />
  if (!agent) return <div className="flex justify-center py-20"><Spinner size={24} /></div>
  const meta = AGENT_META[k]

  async function run() {
    setRunning(true)
    try {
      const r = await api<{ results: { insights: number; tasks: number; aiError: string | null }[] }>('agents', { kind: k })
      const x = r.results[0]
      toast(x ? `${agent!.name} analisou: ${x.insights} notificações, ${x.tasks} tarefas` : 'Agente desativado')
      load()
      reloadAgents()
      reloadCounts()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setRunning(false)
    }
  }

  const profile = (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-6 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.14]" style={{ background: meta.solid }} />
        <div className="relative mx-auto w-fit">
          <AgentAvatar agent={agent} size={88} rounded="rounded-[28px]" />
        </div>
        <h2 className="relative mt-3 text-xl font-bold">{agent.name}</h2>
        <div className={`relative text-sm font-semibold ${meta.fg}`}>{meta.role}</div>
        <p className="relative mt-3 text-sm text-muted">{meta.desc}</p>
        {agent.personality && <p className="relative mt-3 rounded-2xl bg-panel-2 p-3 text-xs italic text-slate-600">“{agent.personality}”</p>}
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <button className="btn-dark h-10 text-xs" onClick={run} disabled={running || !agent.enabled}>
            {running ? <Spinner size={12} /> : <Play size={13} />} Rodar análise
          </button>
          <button className="btn-ghost h-10 text-xs" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Personalizar
          </button>
        </div>
      </div>
      <div className="card p-5">
        <h3 className="mb-3 font-bold">Últimas análises</h3>
        {insights.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma análise ainda. Clique em “Rodar análise”.</p>
        ) : (
          <div className="space-y-2">
            {insights.slice(0, 5).map((n) => (
              <div key={n.id} className="rounded-2xl bg-panel-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{n.title}</div>
                  <span className="shrink-0 text-[10px] text-muted">{timeAgo(n.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-muted">{n.body}</p>
                {n.sources && n.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {n.sources.slice(0, 3).map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-full bg-panel px-2 py-1 text-[10px] font-semibold text-brand">
                        <ExternalLink size={10} /> {s.title || new URL(s.url).hostname}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <Reveal className="mb-4 flex items-center gap-3">
        <Link to="/agentes" className="icon-btn">
          <ArrowLeft size={18} />
        </Link>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {agents.map((a) => (
            <Link
              key={a.id}
              to={`/agentes/${a.kind}`}
              className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold transition ${a.kind === k ? 'bg-ink text-white' : 'bg-panel text-ink hover:bg-panel-2'}`}
            >
              <AgentAvatar agent={a} size={28} rounded="rounded-full" />
              {a.name}
            </Link>
          ))}
        </div>
      </Reveal>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Reveal i={1} className="hidden lg:block">
          {profile}
        </Reveal>
        <Reveal i={2} className="h-[calc(100dvh-15.5rem)] min-h-[440px] md:h-[calc(100dvh-11rem)]">
          <ChatView
            key={k}
            kind={k}
            agent={agent}
            title={agent.name}
            subtitle={`Online · ${meta.role}`}
            suggestions={meta.suggestions}
            headerExtra={
              <button className="icon-btn lg:hidden" onClick={() => setInfo(true)} title="Sobre o agente">
                <Info size={16} />
              </button>
            }
          />
        </Reveal>
      </div>
      {info && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 p-4 pt-16 backdrop-blur-sm lg:hidden" onClick={() => setInfo(false)}>
          <div className="reveal-up mx-auto max-w-md" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setInfo(false)} className="icon-btn mb-3 ml-auto flex">
              <X size={16} />
            </button>
            {profile}
          </div>
        </div>
      )}
      {editing && <EditAgent agent={agent} onClose={() => setEditing(false)} />}
    </div>
  )
}
