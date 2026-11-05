import { useCallback, useEffect, useState } from 'react'
import { Check, CheckCircle2, X } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Approval } from '../lib/types'
import { timeAgo } from '../lib/format'
import { AgentAvatar, Empty, PageHeader, Reveal, Spinner } from '../components/ui'

const KIND_LABEL = { whatsapp_reply: 'Resposta no WhatsApp', whatsapp_outreach: 'Mensagem para cliente', action: 'Ação' }

export default function Approvals() {
  const { agentByKind, reloadCounts, toast, company } = useApp()
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [items, setItems] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    let q = supabase.from('approvals').select('*').order('created_at', { ascending: false }).limit(100)
    q = tab === 'pending' ? q.eq('status', 'pending') : q.neq('status', 'pending')
    const { data } = await q
    setItems((data ?? []) as Approval[])
    setLoading(false)
  }, [tab])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('appr-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals', filter: `company_id=eq.${company.id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, load])

  async function decide(a: Approval, action: 'approve' | 'reject', text: string) {
    try {
      await api('wa-send', { action, approval_id: a.id, text })
      toast(action === 'approve' ? (a.kind === 'action' ? 'Aprovado!' : 'Aprovado e enviado no WhatsApp!') : 'Recusado')
      load()
      reloadCounts()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }

  return (
    <div>
      <PageHeader title="Aprovações" subtitle="Os agentes resolvem sozinhos e só pedem sua decisão quando realmente é necessário." />
      <Reveal i={1} className="mb-4 inline-flex rounded-xl border border-line bg-panel p-1 text-sm">
        {(['pending', 'done'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 ${tab === t ? 'bg-brand text-white' : 'text-muted'}`}>
            {t === 'pending' ? 'Pendentes' : 'Histórico'}
          </button>
        ))}
      </Reveal>
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Reveal i={2} className="card">
          <Empty icon={<CheckCircle2 size={26} />} title={tab === 'pending' ? 'Nada para aprovar' : 'Sem histórico'} text="Quando um agente precisar da sua decisão, aparece aqui e você recebe uma notificação." />
        </Reveal>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((a, i) => (
            <Item key={a.id} a={a} i={i} agent={agentByKind(a.agent_kind as never)} onDecide={decide} />
          ))}
        </div>
      )}
    </div>
  )
}

function Item({ a, i, agent, onDecide }: { a: Approval; i: number; agent: ReturnType<ReturnType<typeof useApp>['agentByKind']>; onDecide: (a: Approval, action: 'approve' | 'reject', text: string) => Promise<void> }) {
  const [text, setText] = useState(a.draft ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const go = async (action: 'approve' | 'reject') => {
    setBusy(action)
    await onDecide(a, action, text)
    setBusy(null)
  }
  return (
    <Reveal i={i + 2} step={70} className="card p-4">
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} kind={a.agent_kind as never} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{a.title}</div>
          <div className="text-xs text-muted">
            {agent?.name} · {KIND_LABEL[a.kind]} · {timeAgo(a.created_at)}
          </div>
        </div>
        {a.status !== 'pending' && (
          <span className={`chip ${a.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{a.status === 'approved' ? 'Aprovado' : 'Recusado'}</span>
        )}
      </div>
      {a.reason && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Motivo: {a.reason}</p>}
      {a.draft !== null &&
        (a.status === 'pending' ? (
          <textarea className="input mt-3 min-h-20 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-sm">{a.draft}</p>
        ))}
      {a.status === 'pending' && (
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-danger px-3 py-2 text-xs" disabled={!!busy} onClick={() => go('reject')}>
            {busy === 'reject' ? <Spinner size={12} /> : <X size={14} />} Recusar
          </button>
          <button className="btn-primary px-3 py-2 text-xs" disabled={!!busy} onClick={() => go('approve')}>
            {busy === 'approve' ? <Spinner size={12} /> : <Check size={14} />} {a.kind === 'action' ? 'Aprovar' : 'Aprovar e enviar'}
          </button>
        </div>
      )}
    </Reveal>
  )
}
