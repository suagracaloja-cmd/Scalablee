import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send, Sparkles, Trash2 } from 'lucide-react'
import { api, supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { AgentAvatar, Reveal } from '../components/ui'

type Msg = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

const SUGGESTIONS = ['Como estão minhas vendas?', 'O que tenho para pagar essa semana?', 'Quais clientes precisam de atenção?', 'Qual meu produto mais vendido?', 'Me dá um resumo do mês']

/** Renderiza **negrito**, _itálico_ e listas simples. */
function Rich({ text }: { text: string }) {
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

export default function Assistant() {
  const { toast } = useApp()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase
      .from('assistant_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => setMsgs((data ?? []) as Msg[]))
  }, [])
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  async function send(q: string) {
    if (!q.trim() || busy) return
    setText('')
    setMsgs((m) => [...m, { id: 'tmp' + Date.now(), role: 'user', content: q, created_at: new Date().toISOString() }])
    setBusy(true)
    try {
      const r = await api<{ reply: Msg }>('assistant', { message: q })
      setMsgs((m) => [...m, r.reply])
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    if (!confirm('Apagar o histórico da conversa?')) return
    const { data: c } = await supabase.from('companies').select('id').single()
    await supabase.from('assistant_messages').delete().eq('company_id', c!.id)
    setMsgs([])
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <Reveal className="mb-4 flex items-center gap-3">
        <AgentAvatar kind="assistant" size={44} />
        <div className="flex-1">
          <h1 className="text-xl font-bold">Assistente IA</h1>
          <p className="text-xs text-muted">Pergunte qualquer coisa sobre sua empresa. Respostas com seus dados reais.</p>
        </div>
        {msgs.length > 0 && (
          <button onClick={clear} className="rounded-lg p-2 text-muted hover:bg-panel-2" title="Limpar conversa">
            <Trash2 size={18} />
          </button>
        )}
      </Reveal>

      <Reveal i={1} className="card flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {msgs.length === 0 && !busy && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Sparkles className="mb-3 text-violet-300" size={32} />
              <p className="font-semibold">Como posso ajudar hoje?</p>
              <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <Reveal key={s} i={i + 2} up>
                    <button onClick={() => send(s)} className="rounded-full border border-line bg-panel-2 px-3 py-1.5 text-xs hover:border-brand">
                      {s}
                    </button>
                  </Reveal>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`reveal-up flex gap-2.5 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && <AgentAvatar kind="assistant" size={30} />}
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-panel-2'}`}>
                {m.role === 'assistant' ? <Rich text={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-2.5">
              <AgentAvatar kind="assistant" size={30} />
              <div className="flex items-center gap-1 rounded-2xl bg-panel-2 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
          <input className="input" placeholder="Ex: como estão minhas vendas essa semana?" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <button className="btn-primary px-3" disabled={busy || !text.trim()} aria-label="Enviar">
            <Send size={18} />
          </button>
        </form>
      </Reveal>
    </div>
  )
}
