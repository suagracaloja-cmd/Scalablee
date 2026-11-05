import { useEffect, useState } from 'react'
import { Bell, CheckCheck, ExternalLink, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Insight } from '../lib/types'
import { AGENT_META } from '../lib/agents'
import { timeAgo } from '../lib/format'
import { AgentAvatar, Empty, PageHeader, Reveal, STATUS_CHIP, STATUS_LABEL } from '../components/ui'

export default function Notifications() {
  const { agentByKind, reloadCounts } = useApp()
  const [items, setItems] = useState<Insight[]>([])
  const [filter, setFilter] = useState<string>('all')

  const load = () =>
    supabase
      .from('insights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setItems((data ?? []) as Insight[]))
  useEffect(() => {
    load()
  }, [])

  async function markAll() {
    await supabase.from('insights').update({ read: true }).eq('read', false)
    load()
    reloadCounts()
  }
  async function markRead(n: Insight) {
    if (n.read) return
    await supabase.from('insights').update({ read: true }).eq('id', n.id)
    setItems((x) => x.map((i) => (i.id === n.id ? { ...i, read: true } : i)))
    reloadCounts()
  }
  async function remove(n: Insight) {
    await supabase.from('insights').delete().eq('id', n.id)
    setItems((x) => x.filter((i) => i.id !== n.id))
    reloadCounts()
  }

  const shown = items.filter((i) => filter === 'all' || i.agent_kind === filter)
  return (
    <div>
      <PageHeader
        title="Notificações"
        subtitle="Ideias, alertas e análises enviadas pelos seus agentes."
        actions={
          <button className="btn-ghost" onClick={markAll}>
            <CheckCheck size={16} /> Marcar todas como lidas
          </button>
        }
      />
      <Reveal i={1} className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {['all', 'marketing', 'sales', 'finance', 'crm', 'support', 'assistant'].map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${filter === k ? 'border-brand bg-brand/20 text-white' : 'border-line text-muted'}`}>
            {k === 'all' ? 'Todas' : `${AGENT_META[k as keyof typeof AGENT_META].emoji} ${agentByKind(k as never)?.name ?? AGENT_META[k as keyof typeof AGENT_META].label}`}
          </button>
        ))}
      </Reveal>
      {shown.length === 0 ? (
        <Reveal i={2} className="card">
          <Empty icon={<Bell size={26} />} title="Nenhuma notificação" text='Vá ao Dashboard e clique em "Rodar análise" para os agentes trabalharem.' />
        </Reveal>
      ) : (
        <div className="space-y-3">
          {shown.map((n, i) => (
            <Reveal key={n.id} i={Math.min(i, 10) + 2} step={60}>
              <div onClick={() => markRead(n)} className={`card flex cursor-pointer gap-3 p-4 ${n.read ? 'opacity-70' : 'border-brand/40'}`}>
                <AgentAvatar agent={n.agent_kind !== 'assistant' ? agentByKind(n.agent_kind) : undefined} kind={n.agent_kind} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-brand" />}
                    <span className="font-semibold">{n.title}</span>
                    {n.priority !== 'normal' && <span className={`chip ${STATUS_CHIP[n.priority]}`}>{STATUS_LABEL[n.priority]}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {n.agent_kind !== 'assistant' ? agentByKind(n.agent_kind)?.name : 'Scalablee'} · {AGENT_META[n.agent_kind].label} · {timeAgo(n.created_at)}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{n.body}</p>
                  {n.sources && n.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {n.sources.slice(0, 4).map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full bg-panel-2 px-2 py-1 text-[11px] text-sky-300">
                          <ExternalLink size={10} /> {s.title || new URL(s.url).hostname}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={(e) => (e.stopPropagation(), remove(n))} className="self-start rounded-lg p-1.5 text-muted hover:bg-panel-2" aria-label="Excluir">
                  <Trash2 size={14} />
                </button>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  )
}
