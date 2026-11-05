import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowUp, Info, Trash2 } from 'lucide-react'
import { callFn, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { Agent, AgentKind } from '../lib/types'
import { fmtTime } from '../lib/format'
import { AgentAvatar } from './ui'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

/** Renderiza **negrito**, _itálico_ e listas simples com segurança. */
export function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        const html = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/(^|\s)_(.+?)_/g, '$1<em>$2</em>')
          .replace(/^#{1,3}\s*(.*)$/, '<strong>$1</strong>')
          .replace(/^\s*[-•*]\s+/, '• ')
        return line.trim() ? <p key={i} dangerouslySetInnerHTML={{ __html: html }} /> : <div key={i} className="h-1" />
      })}
    </div>
  )
}

/** Conversa com a IA geral (kind = null) ou com um agente. */
export function ChatView({ kind, agent, title, subtitle, suggestions, headerExtra }: { kind: AgentKind | null; agent?: Agent; title: string; subtitle: string; suggestions: string[]; headerExtra?: ReactNode }) {
  const { toast, company } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [basic, setBasic] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let q = supabase.from('assistant_messages').select('id,role,content,created_at').order('created_at', { ascending: true }).limit(200)
    q = kind ? q.eq('agent_kind', kind) : q.is('agent_kind', null)
    q.then(({ data }) => {
      setMsgs((data ?? []) as Msg[])
      setLoaded(true)
    })
  }, [kind])
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: loaded ? 'smooth' : 'auto', block: 'end' })
  }, [msgs, busy, loaded])

  async function send(q: string) {
    const msg = q.trim()
    if (!msg || busy) return
    setText('')
    setMsgs((m) => [...m, { id: 'tmp' + Date.now(), role: 'user', content: msg, created_at: new Date().toISOString() }])
    setBusy(true)
    try {
      const r = await callFn<{ reply: Msg; ai: boolean }>('chat', { message: msg, agent: kind })
      setMsgs((m) => [...m, r.reply])
      setBasic(!r.ai)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  async function clear() {
    if (!company || !confirm('Apagar o histórico desta conversa?')) return
    let q = supabase.from('assistant_messages').delete().eq('company_id', company.id)
    q = kind ? q.eq('agent_kind', kind) : q.is('agent_kind', null)
    await q
    setMsgs([])
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <div className="relative">
          <AgentAvatar agent={agent} kind={kind ?? 'assistant'} size={44} />
          <span className="pulse-dot absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{title}</div>
          <div className="truncate text-xs text-muted">{busy ? 'digitando…' : subtitle}</div>
        </div>
        {headerExtra}
        {msgs.length > 0 && (
          <button onClick={clear} className="icon-btn" title="Limpar conversa">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Mensagens */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,#eceef2_1px,transparent_0)] bg-[size:20px_20px] px-4 py-5 sm:px-6">
        {loaded && msgs.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center py-6 text-center">
            <AgentAvatar agent={agent} kind={kind ?? 'assistant'} size={72} rounded="rounded-3xl" />
            <p className="mt-4 text-lg font-bold">Olá! Eu sou {agent?.name ?? 'a IA da Scalable'}.</p>
            <p className="mt-1 max-w-sm text-sm text-muted">Pergunte qualquer coisa — eu respondo com os dados reais da sua empresa.</p>
            <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
              {suggestions.map((s, i) => (
                <button key={s} onClick={() => send(s)} className="reveal-up rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold transition hover:border-brand hover:text-brand" style={{ '--d': `${i * 70}ms` } as React.CSSProperties}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`reveal-up flex items-end gap-2.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && <AgentAvatar agent={agent} kind={kind ?? 'assistant'} size={30} rounded="rounded-xl" />}
            <div className={`max-w-[85%] sm:max-w-[75%]`}>
              <div
                className={`rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user' ? 'rounded-br-lg bg-brand text-white' : 'rounded-bl-lg border border-line bg-panel text-ink shadow-sm'
                }`}
              >
                {m.role === 'assistant' ? <Rich text={m.content} /> : <span className="whitespace-pre-wrap">{m.content}</span>}
              </div>
              <div className={`mt-1 px-2 text-[10px] text-muted ${m.role === 'user' ? 'text-right' : ''}`}>{fmtTime(m.created_at)}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-end gap-2.5">
            <AgentAvatar agent={agent} kind={kind ?? 'assistant'} size={30} rounded="rounded-xl" />
            <div className="typing flex items-center gap-1 rounded-3xl rounded-bl-lg border border-line bg-panel px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {/* Sugestões rápidas + entrada */}
      <div className="border-t border-line bg-panel px-3 pb-3 pt-2 sm:px-5">
        {basic && (
          <div className="mb-2 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            <Info size={14} className="mt-0.5 shrink-0" />
            Modo básico: respondo com os seus dados, mas sem a IA completa. Ative a chave da IA (ANTHROPIC_API_KEY) no Supabase para conversar sobre qualquer assunto.
          </div>
        )}
        {msgs.length > 0 && (
          <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={busy} className="shrink-0 rounded-full bg-panel-2 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-brand-soft hover:text-brand">
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex items-end gap-2 rounded-[22px] bg-panel-2 p-1.5 pl-4 focus-within:ring-4 focus-within:ring-brand/10">
          <textarea
            ref={input}
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-muted"
            placeholder={`Mensagem para ${agent?.name ?? 'a IA'}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(text)
              }
            }}
          />
          <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-dark disabled:opacity-40" disabled={busy || !text.trim()} aria-label="Enviar">
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  )
}
