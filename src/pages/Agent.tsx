import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUp, Check, Copy, Menu, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { AgentMessage, Approval, Thread } from '../lib/types'
import { timeAgo } from '../lib/format'
import { AGENT_NAME, SUGGESTIONS, areaOf } from '../lib/areas'
import { AgentMark, AreaChip, Spinner } from '../components/ui'
import { Markdown } from '../components/Markdown'
import ApprovalCard from '../components/ApprovalCard'
import { useConfirmar } from '../components/Confirmar'

const THINKING = ['Entendendo o pedido…', 'Consultando os dados da clínica…', 'Analisando os resultados…', 'Escrevendo a resposta…']

export default function Agent() {
  const { threadId } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { company, toast } = useApp()
  const confirmar = useConfirmar()
  const [threads, setThreads] = useState<Thread[]>([])
  const [msgs, setMsgs] = useState<AgentMessage[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [thinking, setThinking] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const autoSent = useRef(false)

  const loadThreads = useCallback(async () => {
    const { data } = await supabase.from('agent_threads').select('id,title,created_at,updated_at').order('updated_at', { ascending: false }).limit(100)
    setThreads((data ?? []) as Thread[])
  }, [])

  const loadThread = useCallback(async (id: string) => {
    const [m, a] = await Promise.all([
      supabase.from('assistant_messages').select('id,role,content,meta,created_at').eq('thread_id', id).order('created_at', { ascending: true }).limit(500),
      supabase.from('approvals').select('*').eq('thread_id', id).order('created_at', { ascending: true }),
    ])
    setMsgs((m.data ?? []) as AgentMessage[])
    setApprovals((a.data ?? []) as Approval[])
    setLoaded(true)
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    setDrawer(false)
    if (!threadId) {
      setMsgs([])
      setApprovals([])
      setLoaded(true)
      return
    }
    setLoaded(false)
    loadThread(threadId)
  }, [threadId, loadThread])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, busy])

  useEffect(() => {
    if (!busy) return
    setThinking(0)
    const t = setInterval(() => setThinking((x) => Math.min(x + 1, THINKING.length - 1)), 2600)
    return () => clearInterval(t)
  }, [busy])

  async function send(q: string) {
    const message = q.trim()
    if (!message || busy) return
    setMsgs((m) => [...m, { id: 'tmp-' + Date.now(), role: 'user', content: message, meta: null, created_at: new Date().toISOString() }])
    setBusy(true)
    try {
      const r = await api<{ thread: Thread; message: AgentMessage }>('agente', { message, thread_id: threadId })
      if (!threadId) {
        navigate(`/agente/${r.thread.id}`, { replace: true })
      } else {
        await loadThread(threadId)
      }
      loadThreads()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
      setMsgs((m) => m.filter((x) => !x.id.startsWith('tmp-')))
    } finally {
      setBusy(false)
    }
  }

  // Pergunta vinda do Dashboard (?q=…)
  useEffect(() => {
    const q = params.get('q')
    if (q && !threadId && !autoSent.current && loaded) {
      autoSent.current = true
      setParams({}, { replace: true })
      send(q)
    }
  }, [params, threadId, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  async function rename(t: Thread) {
    const title = prompt('Nome da conversa', t.title)?.trim()
    if (!title) return
    await supabase.from('agent_threads').update({ title: title.slice(0, 80) }).eq('id', t.id)
    loadThreads()
  }
  async function remove(t: Thread) {
    if (!(await confirmar({ titulo: 'Apagar esta conversa?', texto: `"${t.title}": as mensagens são removidas. As aprovações continuam registradas.`, botao: 'Apagar conversa' }))) return
    await supabase.from('agent_threads').delete().eq('id', t.id)
    if (t.id === threadId) navigate('/agente', { replace: true })
    loadThreads()
  }

  const current = threads.find((t) => t.id === threadId)
  const empty = loaded && !busy && msgs.length === 0
  const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
  const basic = lastAssistant?.meta && lastAssistant.meta.ai === false

  const sidebar = (
    <div className="flex h-full flex-col bg-graphite text-white">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <AgentMark size={34} rounded="rounded-xl" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-bold">{AGENT_NAME}</div>
          <div className="truncate text-[11px] text-white/50">{company?.name}</div>
        </div>
        <button onClick={() => setDrawer(false)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 lg:hidden" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <div className="px-3">
        <Link to="/agente" className="flex h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">
          <MessageSquarePlus size={16} /> Nova conversa
        </Link>
      </div>
      <div className="mt-4 px-4 text-[11px] font-semibold uppercase tracking-wide text-white/40">Conversas</div>
      <nav className="mt-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {threads.length === 0 && <p className="px-2 py-3 text-xs text-white/40">Suas conversas aparecem aqui.</p>}
        {threads.map((t) => (
          <div key={t.id} className={`group flex items-center rounded-xl ${t.id === threadId ? 'bg-white/10' : 'hover:bg-white/5'}`}>
            <Link to={`/agente/${t.id}`} className="min-w-0 flex-1 px-3 py-2">
              <div className={`truncate text-sm ${t.id === threadId ? 'font-semibold text-white' : 'text-white/75'}`}>{t.title}</div>
              <div className="text-[10px] text-white/35">{timeAgo(t.updated_at)}</div>
            </Link>
            <div className="mr-1 hidden gap-0.5 group-hover:flex">
              <button onClick={() => rename(t)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Renomear">
                <Pencil size={13} />
              </button>
              <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-rose-300" title="Apagar">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </nav>
    </div>
  )

  return (
    <div className="reveal card flex h-[calc(100dvh-6.5rem)] min-h-[480px] overflow-hidden md:h-[calc(100dvh-7.5rem)]">
      {/* Histórico (desktop) */}
      <aside className="hidden w-72 shrink-0 lg:block">{sidebar}</aside>
      {/* Histórico (celular/tablet) */}
      {drawer && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="reveal h-full w-[82%] max-w-xs" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Barra do topo */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-5">
          <button onClick={() => setDrawer(true)} className="icon-btn lg:hidden" aria-label="Conversas">
            <Menu size={17} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{current?.title ?? (threadId ? '…' : 'Nova conversa')}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${basic ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {AGENT_NAME} · {basic ? 'modo básico' : 'online'}
            </div>
          </div>
          {threadId && (
            <Link to="/agente" className="btn-ghost h-9 px-3 text-xs">
              <MessageSquarePlus size={15} /> <span className="hidden sm:inline">Nova conversa</span>
            </Link>
          )}
        </div>

        {/* Mensagens */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col justify-center px-4 py-8">
              <div className="reveal-up flex flex-col items-center text-center">
                <AgentMark size={56} rounded="rounded-[20px]" />
                <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-[28px]">Como posso ajudar {company?.name ? `a ${company.name}` : ''} hoje?</h1>
                <p className="mt-1.5 max-w-md text-sm text-muted">Sou a {AGENT_NAME}: agenda, pacientes, atendimentos, WhatsApp, marketing, financeiro e gestão em uma única conversa, com os dados reais da sua clínica.</p>
              </div>
              <div className="reveal-up mt-7" style={{ '--d': '80ms' } as React.CSSProperties}>
                <Composer onSend={send} busy={busy} autoFocus big />
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s, i) => {
                  const a = areaOf(s.area)
                  return (
                    <button
                      key={s.text}
                      onClick={() => send(s.text)}
                      className="reveal-up flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left text-sm transition hover:border-brand hover:bg-brand-soft/40"
                      style={{ '--d': `${140 + i * 50}ms` } as React.CSSProperties}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${a.cls}`}>
                        <a.icon size={15} />
                      </span>
                      <span className="font-medium">{s.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-7 px-4 py-6 sm:px-6">
              {!loaded && (
                <div className="flex justify-center py-10">
                  <Spinner size={22} />
                </div>
              )}
              {msgs.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="reveal-up flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-ink px-4 py-3 text-[15px] leading-6 text-white">{m.content}</div>
                  </div>
                ) : (
                  <AssistantMessage key={m.id} m={m} approvals={approvals.filter((a) => m.meta?.approvals?.includes(a.id))} onApprovalChange={() => threadId && loadThread(threadId)} />
                ),
              )}
              {busy && (
                <div className="flex gap-3">
                  <AgentMark size={30} rounded="rounded-xl" />
                  <div className="pt-1">
                    <div className="typing flex items-center gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="h-2 w-2 rounded-full bg-brand" style={{ animationDelay: `${i * 150}ms` }} />
                      ))}
                    </div>
                    <div className="mt-1.5 text-xs text-muted">{THINKING[thinking]}</div>
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
          )}
        </div>

        {/* Entrada (fixa embaixo quando há conversa) */}
        {!empty && (
          <div className="border-t border-line bg-panel px-3 pb-3 pt-3 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <Composer onSend={send} busy={busy} />
              <p className="mt-1.5 text-center text-[10px] text-muted">A {AGENT_NAME} usa os dados da clínica. Envios, lançamentos e exclusões só acontecem após a sua aprovação.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function AssistantMessage({ m, approvals, onApprovalChange }: { m: AgentMessage; approvals: Approval[]; onApprovalChange: () => void }) {
  const [copied, setCopied] = useState(false)
  const steps = m.meta?.steps ?? []
  const uniq = steps.filter((s, i) => steps.findIndex((x) => x.tool === s.tool) === i)
  return (
    <div className="reveal-up flex gap-3">
      <AgentMark size={30} rounded="rounded-xl" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          <span className="font-bold">{AGENT_NAME}</span>
          <span className="text-muted">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {uniq.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {uniq.map((s) => (
              <span key={s.tool} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${s.ok ? 'border-line text-slate-600' : 'border-rose-200 text-rose-600'}`}>
                {s.ok ? <Check size={11} className="text-emerald-600" /> : <X size={11} />}
                {s.label}
                {s.area && <span className="text-muted">· {areaOf(s.area === 'management' ? 'crm' : s.area).label}</span>}
              </span>
            ))}
          </div>
        )}
        <Markdown text={m.meta?.ai === false ? m.content.replace(/\n*_\(Modo básico:[\s\S]*?\)_\s*$/, '') : m.content} />
        {approvals.length > 0 && (
          <div className="mt-4 space-y-3">
            {approvals.map((a) => (
              <ApprovalCard key={a.id} a={a} compact onChange={onApprovalChange} />
            ))}
            <Link to="/aprovacoes" className="inline-block text-xs font-semibold text-brand-dark">
              Ver na Central de Aprovações →
            </Link>
          </div>
        )}
        {m.meta?.ai === false && (
          <p className="mt-3 inline-flex rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
            Modo básico{m.meta.aiError ? `: ${m.meta.aiError}` : ': chave da IA não configurada'} — resposta montada com os seus dados, sem a IA completa.
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(m.content).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
            className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
            title="Copiar resposta"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {[...new Set(uniq.map((s) => (s.area === 'management' ? 'crm' : s.area)).filter(Boolean))].map((k) => (
            <AreaChip key={k} kind={k} className="opacity-70" />
          ))}
        </div>
      </div>
    </div>
  )
}

function Composer({ onSend, busy, autoFocus = false, big = false }: { onSend: (q: string) => void; busy: boolean; autoFocus?: boolean; big?: boolean }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }, [text])
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || busy) return
    onSend(text)
    setText('')
  }
  return (
    <form onSubmit={submit} className={`flex items-end gap-2 rounded-[26px] border border-line bg-panel p-2 pl-4 shadow-[0_6px_24px_-12px_rgba(11,13,18,0.18)] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 ${big ? 'py-2.5' : ''}`}>
      <textarea
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        maxLength={8000}
        className={`max-h-56 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted ${big ? 'min-h-[52px]' : ''}`}
        placeholder={`Pergunte ou peça algo à ${AGENT_NAME}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-ink transition hover:bg-brand-dark disabled:opacity-40" disabled={busy || !text.trim()} aria-label="Enviar">
        {busy ? <Spinner size={16} /> : <ArrowUp size={19} strokeWidth={2.6} />}
      </button>
    </form>
  )
}
