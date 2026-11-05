import { useEffect, useRef, useState } from 'react'
import { Pencil, Play, Upload } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Agent, Insight } from '../lib/types'
import { AGENT_META, AVATAR_STYLES, presetAvatar } from '../lib/agents'
import { AgentAvatar, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'
import { timeAgo } from '../lib/format'

export default function Agents() {
  const { agents, reloadAgents, toast, company, reloadCounts } = useApp()
  const [editing, setEditing] = useState<Agent | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])

  const loadInsights = () =>
    supabase
      .from('insights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setInsights((data ?? []) as Insight[]))
  useEffect(() => {
    loadInsights()
  }, [])

  async function run(a: Agent) {
    setRunning(a.kind)
    try {
      const r = await api<{ results: { insights: number; tasks: number; approvals: number; aiError: string | null }[] }>('agents', { kind: a.kind })
      const x = r.results[0]
      toast(x ? `${a.name}: ${x.insights} notificações, ${x.tasks} tarefas, ${x.approvals} aprovações` : `${a.name} está desativado`)
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
      <PageHeader title="Agentes de IA" subtitle="Personalize o nome, a foto e o jeito de cada agente. Eles trabalham com os dados reais da sua empresa." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a, i) => {
          const meta = AGENT_META[a.kind]
          const mine = insights.filter((x) => x.agent_kind === a.kind).slice(0, 3)
          return (
            <Reveal key={a.id} i={i + 1} className="card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <AgentAvatar agent={a} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-lg font-bold">{a.name}</h3>
                    <span className={`h-2 w-2 rounded-full ${a.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  </div>
                  <span className={`chip ${meta.color}`}>
                    {meta.emoji} {meta.label}
                  </span>
                </div>
                <button className="rounded-lg p-2 text-muted hover:bg-panel-2" onClick={() => setEditing(a)} aria-label="Editar">
                  <Pencil size={16} />
                </button>
              </div>
              <p className="mt-3 text-sm text-muted">{meta.desc}</p>
              {a.personality && <p className="mt-2 text-xs italic text-slate-400">“{a.personality}”</p>}
              <div className="mt-4 flex-1 space-y-2">
                {mine.map((n) => (
                  <div key={n.id} className="rounded-xl bg-panel-2 p-2.5">
                    <div className="text-xs font-semibold">{n.title}</div>
                    <div className="line-clamp-2 whitespace-pre-line text-[11px] text-muted">{n.body}</div>
                  </div>
                ))}
                {!mine.length && <p className="text-xs text-muted">Nenhuma análise ainda.</p>}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-muted">{a.last_run_at ? `Última análise ${timeAgo(a.last_run_at)}` : 'Nunca executado'}</span>
                <button className="btn-ghost px-3 py-1.5 text-xs" disabled={!!running || !a.enabled} onClick={() => run(a)}>
                  {running === a.kind ? <Spinner size={12} /> : <Play size={14} />} Analisar agora
                </button>
              </div>
            </Reveal>
          )
        })}
      </div>
      {editing && company && (
        <EditAgent
          agent={editing}
          companyId={company.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await reloadAgents()
            setEditing(null)
            toast('Agente atualizado!')
          }}
        />
      )}
    </div>
  )
}

function EditAgent({ agent, companyId, onClose, onSaved }: { agent: Agent; companyId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp()
  const [f, setF] = useState({ ...agent })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function upload(fl: File) {
    if (fl.size > 2 * 1024 * 1024) return toast('Imagem muito grande (máx. 2MB)', 'err')
    setUploading(true)
    const ext = fl.name.split('.').pop() || 'png'
    const path = `${companyId}/${agent.kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, fl, { upsert: true, contentType: fl.type })
    setUploading(false)
    if (error) return toast(error.message, 'err')
    setF({ ...f, avatar_url: supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl })
  }

  async function save() {
    if (!f.name.trim()) return toast('Dê um nome ao agente', 'err')
    setBusy(true)
    const { error } = await supabase
      .from('agents')
      .update({ name: f.name.trim(), avatar_url: f.avatar_url, personality: f.personality, enabled: f.enabled, auto_reply: f.auto_reply })
      .eq('id', agent.id)
    setBusy(false)
    if (error) return toast(error.message, 'err')
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={`Editar agente de ${AGENT_META[agent.kind].label}`} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <AgentAvatar agent={f} size={72} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" onClick={() => file.current?.click()} disabled={uploading}>
              {uploading ? <Spinner size={12} /> : <Upload size={14} />} Enviar foto
            </button>
            {f.avatar_url && (
              <button className="btn-ghost text-xs" onClick={() => setF({ ...f, avatar_url: null })}>
                Remover
              </button>
            )}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>
        </div>
        <div>
          <span className="label">Ou escolha um avatar</span>
          <div className="grid grid-cols-8 gap-2">
            {AVATAR_STYLES.map((s) => {
              const url = presetAvatar(s, f.name || agent.kind)
              return (
                <button
                  key={s}
                  onClick={() => setF({ ...f, avatar_url: url })}
                  className={`aspect-square overflow-hidden rounded-full border-2 ${f.avatar_url === url ? 'border-brand' : 'border-transparent'}`}
                >
                  <img src={url} alt={s} className="h-full w-full" loading="lazy" />
                </button>
              )
            })}
          </div>
        </div>
        <Field label="Nome do agente">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} />
        </Field>
        <Field label="Personalidade / instruções">
          <textarea
            className="input min-h-24"
            value={f.personality ?? ''}
            onChange={(e) => setF({ ...f, personality: e.target.value })}
            placeholder="Ex: Fala de forma descontraída, usa emojis, sempre oferece frete grátis acima de R$ 200…"
          />
        </Field>
        <label className="flex items-center justify-between rounded-xl bg-panel-2 p-3 text-sm">
          Agente ativo
          <input type="checkbox" className="h-5 w-5 accent-violet-500" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
        </label>
        {agent.kind === 'support' && (
          <label className="flex items-center justify-between gap-4 rounded-xl bg-panel-2 p-3 text-sm">
            <span>
              Responder automaticamente no WhatsApp
              <span className="block text-xs text-muted">Desligado: toda resposta passa pela sua aprovação. Ligado: só pede aprovação quando necessário (descontos, reclamações, dúvidas sem resposta).</span>
            </span>
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-violet-500" checked={f.auto_reply} onChange={(e) => setF({ ...f, auto_reply: e.target.checked })} />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  )
}
