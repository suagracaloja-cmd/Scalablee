import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Bot, Check, Copy, MessageCircle, Send, Settings2, X } from 'lucide-react'
import { api, supabase, WEBHOOK_URL } from '../lib/supabase'
import { useApp } from '../lib/store'
import { AGENT_NAME } from '../lib/areas'
import type { Approval, Conversation, Message } from '../lib/types'
import { fmtTime, timeAgo } from '../lib/format'
import { AgentMark, Empty, Field, Modal, PageHeader, Reveal, Spinner } from '../components/ui'

type Status = { phone_number_id: string; display_phone: string | null; verify_token: string; connected: boolean } | null

export default function WhatsApp() {
  const { company, toast, reloadCounts } = useApp()
  const [status, setStatus] = useState<Status | undefined>(undefined)
  const [showSetup, setShowSetup] = useState(false)
  const [convs, setConvs] = useState<Conversation[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [msgs, setMsgs] = useState<Message[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  const loadStatus = useCallback(async () => {
    const { data } = await supabase.rpc('whatsapp_status')
    setStatus(((data as Status[] | null) ?? [])[0] ?? null)
  }, [])
  const loadConvs = useCallback(async () => {
    const { data } = await supabase.from('conversations').select('*').order('last_message_at', { ascending: false })
    setConvs((data ?? []) as Conversation[])
  }, [])
  const loadMsgs = useCallback(async (id: string) => {
    const [m, a] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', id).order('created_at'),
      supabase.from('approvals').select('*').eq('conversation_id', id).eq('status', 'pending'),
    ])
    setMsgs((m.data ?? []) as Message[])
    setApprovals((a.data ?? []) as Approval[])
  }, [])

  useEffect(() => {
    loadStatus()
    loadConvs()
  }, [loadStatus, loadConvs])

  useEffect(() => {
    if (!active) return
    loadMsgs(active.id)
    if (active.unread) supabase.from('conversations').update({ unread: 0 }).eq('id', active.id).then(() => (loadConvs(), reloadCounts()))
  }, [active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  // Tempo real
  useEffect(() => {
    if (!company) return
    const ch = supabase
      .channel('wa-' + company.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `company_id=eq.${company.id}` }, (p) => {
        const m = p.new as Message
        if (active && m.conversation_id === active.id) loadMsgs(active.id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${company.id}` }, () => loadConvs())
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [company, active, loadMsgs, loadConvs])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!active || !text.trim()) return
    setSending(true)
    try {
      await api('wa-send', { action: 'send', conversation_id: active.id, text })
      setText('')
      loadMsgs(active.id)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setSending(false)
    }
  }

  async function decide(a: Approval, action: 'approve' | 'reject', body?: string) {
    try {
      await api('aprovacoes', { action, id: a.id, text: body })
      toast(action === 'approve' ? 'Mensagem enviada!' : 'Sugestão descartada')
      if (active) loadMsgs(active.id)
      reloadCounts()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  async function toggleAI() {
    if (!active) return
    const v = !active.ai_paused
    await supabase.from('conversations').update({ ai_paused: v }).eq('id', active.id)
    setActive({ ...active, ai_paused: v })
    toast(v ? 'IA pausada nesta conversa — você assume' : 'IA reativada nesta conversa')
  }

  if (status === undefined)
    return (
      <div className="flex justify-center py-20">
        <Spinner size={24} />
      </div>
    )

  return (
    <div>
      <PageHeader
        title="WhatsApp Business"
        subtitle={
          status
            ? `${status.display_phone ?? status.phone_number_id} · ${status.connected ? 'Recebendo mensagens' : 'Aguardando configuração do webhook'}`
            : 'Conecte seu número para a IA atender seus clientes'
        }
        actions={
          <button className="btn-ghost" onClick={() => setShowSetup(true)}>
            <Settings2 size={16} /> {status ? 'Configuração' : 'Conectar WhatsApp'}
          </button>
        }
      />

      {!status ? (
        <Reveal i={1} className="card">
          <Empty
            icon={<MessageCircle size={28} />}
            title="WhatsApp ainda não conectado"
            text={`Conecte o WhatsApp Business (API oficial da Meta). ${AGENT_NAME} vai responder seus clientes automaticamente e pedir sua aprovação quando for necessário.`}
            action={
              <button className="btn-primary" onClick={() => setShowSetup(true)}>
                Conectar agora
              </button>
            }
          />
        </Reveal>
      ) : (
        <Reveal i={1} className="card grid h-[calc(100dvh-15rem)] min-h-[420px] overflow-hidden md:h-[calc(100dvh-12rem)] md:grid-cols-[320px_1fr]">
          {/* Lista */}
          <div className={`min-h-0 overflow-y-auto border-r border-line ${active ? 'hidden md:block' : ''}`}>
            {!status.connected && (
              <div className="m-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-600">Finalize a configuração do webhook na Meta para começar a receber mensagens.</div>
            )}
            {convs.length === 0 && <Empty icon={<MessageCircle size={22} />} title="Nenhuma conversa ainda" text="Quando um cliente mandar mensagem, ela aparece aqui." />}
            {convs.map((c) => (
              <button key={c.id} onClick={() => setActive(c)} className={`flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-panel-2 ${active?.id === c.id ? 'bg-panel-2' : ''}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 font-semibold text-emerald-600">{(c.contact_name ?? '?')[0]?.toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.contact_name ?? c.wa_id}</span>
                    <span className="shrink-0 text-[10px] text-muted">{timeAgo(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    +{c.wa_id} {c.ai_paused && <span className="chip bg-amber-50 text-amber-600">IA pausada</span>}
                  </div>
                </div>
                {c.unread > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-black">{c.unread}</span>}
              </button>
            ))}
          </div>

          {/* Chat */}
          <div className={`flex min-h-0 flex-col ${active ? '' : 'hidden md:flex'}`}>
            {!active ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted">Selecione uma conversa</div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <button className="md:hidden" onClick={() => setActive(null)}>
                    <ArrowLeft size={20} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{active.contact_name ?? active.wa_id}</div>
                    <div className="text-xs text-muted">+{active.wa_id}</div>
                  </div>
                  <button onClick={toggleAI} className={`btn px-3 py-1.5 text-xs ${active.ai_paused ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <Bot size={14} /> {active.ai_paused ? 'IA pausada' : 'IA ativa'}
                  </button>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,#eceef2_1px,transparent_0)] bg-[size:18px_18px] p-4">
                  {msgs.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : ''}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                          m.direction === 'in'
                            ? 'rounded-bl-md bg-panel-2'
                            : m.status === 'pending_approval'
                              ? 'rounded-br-md border border-dashed border-amber-400/60 bg-amber-50'
                              : m.status === 'rejected'
                                ? 'rounded-br-md bg-slate-100 text-muted line-through'
                                : 'rounded-br-md bg-brand-soft text-ink'
                        }`}
                      >
                        {m.direction === 'out' && (
                          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                            {m.author === 'agent' ? (
                              <>
                                <AgentMark size={14} rounded="rounded" /> {AGENT_NAME}
                              </>
                            ) : (
                              'Você'
                            )}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.body}</div>
                        <div className="mt-0.5 text-right text-[10px] text-muted">
                          {fmtTime(m.created_at)} {m.status === 'pending_approval' && '· aguardando aprovação'} {m.status === 'failed' && <span className="text-rose-600">· falhou: {m.error}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {approvals.map((a) => (
                    <InlineApproval key={a.id} a={a} onDecide={decide} />
                  ))}
                  <div ref={end} />
                </div>
                <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
                  <input className="input" placeholder="Escreva uma mensagem…" value={text} onChange={(e) => setText(e.target.value)} />
                  <button className="btn-primary px-3" disabled={sending || !text.trim()} aria-label="Enviar">
                    {sending ? <Spinner /> : <Send size={18} />}
                  </button>
                </form>
              </>
            )}
          </div>
        </Reveal>
      )}

      {showSetup && (
        <Setup
          status={status}
          onClose={() => setShowSetup(false)}
          onSaved={() => {
            loadStatus()
            toast('WhatsApp conectado! Agora configure o webhook na Meta.')
          }}
        />
      )}
    </div>
  )
}

function InlineApproval({ a, onDecide }: { a: Approval; onDecide: (a: Approval, action: 'approve' | 'reject', text?: string) => Promise<void> }) {
  const [text, setText] = useState(a.draft ?? '')
  const [busy, setBusy] = useState(false)
  const go = async (action: 'approve' | 'reject') => {
    setBusy(true)
    await onDecide(a, action, text)
    setBusy(false)
  }
  return (
    <div className="ml-auto max-w-[90%] rounded-2xl border border-amber-400/40 bg-amber-50 p-3">
      <div className="mb-2 text-xs font-semibold text-amber-600">⚠️ Aprovação: {a.reason}</div>
      <textarea className="input min-h-16 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn-danger px-3 py-1.5 text-xs" disabled={busy} onClick={() => go('reject')}>
          <X size={14} /> Descartar
        </button>
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !text.trim()} onClick={() => go('approve')}>
          {busy ? <Spinner size={12} /> : <Check size={14} />} Aprovar e enviar
        </button>
      </div>
    </div>
  )
}

function Setup({ status, onClose, onSaved }: { status: Status; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp()
  const [phoneId, setPhoneId] = useState(status?.phone_number_id ?? '')
  const [token, setToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [hasSecret, setHasSecret] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Status>(status)

  useEffect(() => {
    supabase.rpc('whatsapp_has_app_secret').then(({ data }) => setHasSecret(data === true))
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('wa-send', { action: 'connect', phone_number_id: phoneId, access_token: token, app_secret: appSecret })
      const { data } = await supabase.rpc('whatsapp_status')
      setSaved(((data as Status[] | null) ?? [])[0] ?? null)
      const { data: has } = await supabase.rpc('whatsapp_has_app_secret')
      setHasSecret(has === true)
      setToken('')
      setAppSecret('')
      onSaved()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }
  async function disconnect() {
    if (!confirm('Desconectar o WhatsApp? A IA para de responder.')) return
    await supabase.rpc('whatsapp_disconnect')
    location.reload()
  }
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast('Copiado!'))

  return (
    <Modal open onClose={onClose} title="Conectar WhatsApp Business" wide>
      <ol className="mb-5 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Acesse <b className="text-ink">developers.facebook.com</b> → crie um app do tipo <b className="text-ink">Business</b> e adicione o produto <b className="text-ink">WhatsApp</b>.
        </li>
        <li>
          Em <b className="text-ink">WhatsApp → Configuração da API</b>, copie o <b className="text-ink">Phone Number ID</b> e gere um <b className="text-ink">token de acesso permanente</b> (usuário do sistema).
        </li>
        <li>Cole abaixo e salve. Depois configure o webhook com a URL e o token de verificação que aparecerem.</li>
        <li>
          No webhook, assine o campo <b className="text-ink">messages</b>.
        </li>
      </ol>
      <form onSubmit={save} className="space-y-3">
        <Field label="Phone Number ID">
          <input className="input" required value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="Ex: 123456789012345" />
        </Field>
        <Field label={saved ? 'Token de acesso (deixe vazio para manter o atual)' : 'Token de acesso'}>
          <input className="input" type="password" required={!saved} value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG…" />
        </Field>
        <Field label={hasSecret ? 'Chave secreta do app — App Secret (deixe vazio para manter a atual)' : 'Chave secreta do app — App Secret (recomendado)'}>
          <input className="input" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="Configurações do app → Básico → Chave secreta do app" autoComplete="off" />
        </Field>
        {hasSecret !== null && (
          <p className={`rounded-xl px-3 py-2 text-xs ${hasSecret ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {hasSecret
              ? '✓ Verificação de autenticidade ligada: só mensagens assinadas pela Meta são aceitas.'
              : '⚠️ Sem a chave secreta do app, a Scalable não consegue confirmar que as mensagens recebidas vieram mesmo da Meta. Cole a chave para ligar essa proteção.'}
          </p>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner />} Validar e salvar
        </button>
      </form>
      {saved && (
        <div className="mt-5 space-y-3 rounded-2xl border border-line bg-panel-2 p-4">
          <div className="text-sm font-semibold">Configuração do webhook na Meta</div>
          {[
            { l: 'URL de callback', v: WEBHOOK_URL },
            { l: 'Token de verificação', v: saved.verify_token },
          ].map((x) => (
            <div key={x.l}>
              <div className="label">{x.l}</div>
              <div className="flex gap-2">
                <code className="input truncate font-mono text-xs">{x.v}</code>
                <button type="button" className="btn-ghost px-3" onClick={() => copy(x.v)}>
                  <Copy size={14} />
                </button>
              </div>
            </div>
          ))}
          <div className={`text-xs ${saved.connected ? 'text-emerald-600' : 'text-amber-600'}`}>
            {saved.connected ? '✓ Webhook verificado — recebendo mensagens' : 'Aguardando a Meta verificar o webhook…'}
          </div>
          <button type="button" className="btn-danger w-full text-xs" onClick={disconnect}>
            Desconectar WhatsApp
          </button>
        </div>
      )}
    </Modal>
  )
}
