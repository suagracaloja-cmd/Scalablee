import { useState, type FormEvent } from 'react'
import { Bot, LineChart, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/Layout'
import { Reveal, Spinner } from '../components/ui'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (!data.session) setMsg({ t: 'ok', m: 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois faça login.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg({ t: 'ok', m: 'Enviamos um link de redefinição para o seu e-mail.' })
      }
    } catch (err) {
      setMsg({ t: 'err', m: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-line bg-panel lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand/30 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-2/20 blur-3xl" />
        <Reveal className="relative">
          <Logo />
        </Reveal>
        <div className="relative">
          <Reveal i={1}>
            <h1 className="text-4xl font-extrabold leading-tight">
              Sua empresa no piloto automático com <span className="text-gradient">5 agentes de IA</span>.
            </h1>
          </Reveal>
          <div className="mt-8 space-y-4">
            {[
              { icon: Bot, t: 'Marketing, Vendas, Financeiro, CRM e Atendimento trabalhando por você' },
              { icon: MessageCircle, t: 'WhatsApp Business respondido pela IA — você só aprova o que importa' },
              { icon: LineChart, t: 'Dashboard em tempo real com tudo que precisa da sua atenção' },
            ].map((f, i) => (
              <Reveal key={i} i={i + 2} className="flex items-center gap-3 text-slate-300">
                <span className="rounded-xl bg-brand/20 p-2 text-violet-300">
                  <f.icon size={18} />
                </span>
                {f.t}
              </Reveal>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-muted">© {new Date().getFullYear()} Scalablee</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <Reveal className="mb-8 lg:hidden">
            <Logo />
          </Reveal>
          <Reveal i={1}>
            <h2 className="text-2xl font-bold">{mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha'}</h2>
            <p className="mt-1 text-sm text-muted">{mode === 'signup' ? 'Comece a gerir sua empresa com IA.' : 'Bem-vindo de volta!'}</p>
          </Reveal>
          <Reveal i={2} className="mt-6 space-y-4">
            <input className="input" type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {mode !== 'reset' && (
              <input
                className="input"
                type="password"
                required
                minLength={6}
                placeholder="Senha (mín. 6 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            )}
            {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.t === 'err' ? 'bg-rose-500/15 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'}`}>{msg.m}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner />} {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
            </button>
          </Reveal>
          <Reveal i={3} className="mt-6 space-y-2 text-center text-sm text-muted">
            {mode === 'login' ? (
              <>
                <p>
                  Não tem conta?{' '}
                  <button type="button" className="font-semibold text-violet-300" onClick={() => setMode('signup')}>
                    Criar agora
                  </button>
                </p>
                <button type="button" className="text-xs hover:text-slate-300" onClick={() => setMode('reset')}>
                  Esqueci minha senha
                </button>
              </>
            ) : (
              <button type="button" className="font-semibold text-violet-300" onClick={() => setMode('login')}>
                Já tenho conta
              </button>
            )}
          </Reveal>
        </form>
      </div>
    </div>
  )
}
