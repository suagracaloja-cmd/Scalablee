import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, CalendarDays, ClipboardList, Filter, Maximize2, MessageCircle, SquarePen, TrendingUp, UserRoundSearch, Wallet, X, type LucideIcon } from 'lucide-react'
import { api } from '../lib/supabase'
import { useApp } from '../lib/store'
import { AGENT_NAME } from '../lib/areas'
import type { AgentMessage, Papel } from '../lib/types'
import { Markdown } from './Markdown'
import { Orb, Spinner } from './ui'

type Sugestao = { icone: LucideIcon; texto: string; papeis?: Papel[] }
const SUGESTOES: Sugestao[] = [
  { icone: CalendarDays, texto: 'Qual é a minha agenda de hoje?' },
  { icone: Wallet, texto: 'Quanto faturei nos últimos 30 dias?', papeis: ['dono'] },
  { icone: Filter, texto: 'Como está o funil de pacientes?' },
  { icone: UserRoundSearch, texto: 'Quais pacientes precisam de follow-up hoje?' },
  { icone: MessageCircle, texto: 'Quais conversas do WhatsApp aguardam resposta?', papeis: ['dono', 'recepcao'] },
  { icone: TrendingUp, texto: 'Quais horários livres tenho amanhã?' },
  { icone: ClipboardList, texto: 'Monte um plano de ação para esta semana' },
]
const ASSUNTOS: Record<Papel, string> = {
  dono: 'agenda, pacientes, financeiro, vendas, conversas ou configurações',
  recepcao: 'agenda, pacientes, vendas e conversas do WhatsApp',
  profissional: 'agenda, pacientes e tarefas',
}

type Msg = Pick<AgentMessage, 'id' | 'role' | 'content' | 'meta'>

/** Painel lateral da Coraline AI: abre por cima de qualquer tela, com sugestões e conversa rápida. */
export function CoralinePainel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { company, papel, toast, reloadCounts } = useApp()
  const [threadId, setThreadId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    setTimeout(() => campo.current?.focus(), 50)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, busy])

  async function enviar(t: string) {
    const message = t.trim()
    if (!message || busy) return
    setTexto('')
    setMsgs((m) => [...m, { id: 'u' + Date.now(), role: 'user', content: message, meta: null }])
    setBusy(true)
    try {
      const r = await api<{ thread: { id: string }; message: Msg }>('agente', { message, thread_id: threadId })
      setThreadId(r.thread.id)
      setMsgs((m) => [...m, r.message])
      if (r.message.meta?.approvals?.length) reloadCounts()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    enviar(texto)
  }
  const nova = () => {
    setThreadId(null)
    setMsgs([])
    campo.current?.focus()
  }

  if (!open) return null
  const clinica = company?.name ?? 'sua clínica'
  const sugestoes = SUGESTOES.filter((s) => !s.papeis || s.papeis.includes(papel)).slice(0, 6)

  return (
    <div className="fixed inset-0 z-[60] md:inset-auto md:bottom-4 md:right-4 md:top-4" role="dialog" aria-modal="true" aria-label={AGENT_NAME}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] md:hidden" onClick={onClose} />
      <section className="reveal-up relative flex h-full w-full flex-col overflow-hidden border border-white bg-white shadow-[0_30px_80px_-30px_rgba(30,60,140,0.45)] md:w-[440px] md:rounded-[28px]">
        <header className="flex items-center gap-2.5 border-b border-line/70 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
          <Orb size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-bold">{AGENT_NAME}</div>
            <div className="truncate text-[11px] text-muted">{clinica}</div>
          </div>
          <button className="icon-btn h-9 w-9 border-0 bg-transparent" onClick={nova} title="Nova conversa" aria-label="Nova conversa">
            <SquarePen size={16} />
          </button>
          <Link to={threadId ? `/agente/${threadId}` : '/agente'} onClick={onClose} className="icon-btn h-9 w-9 border-0 bg-transparent" title="Abrir em tela cheia (com o histórico)" aria-label="Abrir em tela cheia">
            <Maximize2 size={15} />
          </Link>
          <button className="icon-btn h-9 w-9 border-0 bg-transparent" onClick={onClose} title="Fechar" aria-label="Fechar">
            <X size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {msgs.length === 0 ? (
            <div className="flex min-h-full flex-col">
              <div className="flex flex-col items-center pt-4 text-center">
                <Orb size={72} className="orb-viva" />
                <h2 className="mt-5 text-xl font-bold leading-snug">O que você quer saber da clínica?</h2>
                <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted">
                  Pergunte sobre {ASSUNTOS[papel]}. Respondo só com os dados da {clinica}.
                </p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                {sugestoes.map((s) => (
                  <button key={s.texto} onClick={() => enviar(s.texto)} className="group flex flex-col items-start gap-2 rounded-2xl border border-line/80 bg-white/80 p-3 text-left text-xs font-medium leading-snug transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_10px_24px_-14px_rgba(47,111,230,0.5)]">
                    <s.icone size={15} className="text-brand-dark" />
                    {s.texto}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              {msgs.map((m) =>
                m.role === 'user' ? (
                  <li key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm text-white">
                    {m.content}
                  </li>
                ) : (
                  <li key={m.id} className="flex gap-2.5">
                    <Orb size={26} className="mt-0.5" />
                    <div className="min-w-0 flex-1 text-sm">
                      {!!m.meta?.steps?.length && (
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          {[...new Set(m.meta.steps.map((s) => s.label))].map((l) => (
                            <span key={l} className="chip bg-brand-soft text-ink">
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="[&_.md]:text-sm [&_.md]:leading-6">
                        <Markdown text={m.content} />
                      </div>
                      {!!m.meta?.approvals?.length && (
                        <Link to="/aprovacoes" onClick={onClose} className="mt-2 inline-flex text-xs font-semibold text-brand-dark underline underline-offset-2">
                          Ver na Central de Aprovações
                        </Link>
                      )}
                    </div>
                  </li>
                ),
              )}
              {busy && (
                <li className="flex items-center gap-2.5 text-sm text-muted" role="status">
                  <Orb size={26} className="orb-viva" /> Consultando os dados da clínica…
                </li>
              )}
            </ul>
          )}
          <div ref={fim} />
        </div>

        <form onSubmit={submit} className="border-t border-line/70 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-white px-3 py-2 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
            <textarea
              ref={campo}
              rows={1}
              maxLength={8000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  enviar(texto)
                }
              }}
              placeholder="Pergunte qualquer coisa"
              aria-label={`Mensagem para a ${AGENT_NAME}`}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
            />
            <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5aaeff] to-[#2f6fe6] text-white disabled:opacity-40" disabled={busy || !texto.trim()} aria-label="Enviar">
              {busy ? <Spinner size={14} /> : <ArrowUp size={17} />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">A {AGENT_NAME} pode cometer erros. Confira informações importantes.</p>
        </form>
      </section>
    </div>
  )
}
