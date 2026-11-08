import { useState, type FormEvent } from 'react'
import { BellRing, MessageCircle, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LEGAL_VERSION } from '../lib/legal'
import { Logo, Reveal, Spinner } from '../components/ui'
import { LegalFooter } from '../components/LegalFooter'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null)
  const [accepted, setAccepted] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        if (!accepted) throw new Error('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { terms_accepted_at: new Date().toISOString(), terms_version: LEGAL_VERSION } },
        })
        if (error) throw error
        if (!data.session) setMsg({ t: 'ok', m: 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois faça login.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg({ t: 'ok', m: 'Enviamos um link de redefinição para o seu e-mail.' })
      }
    } catch (err) {
      setMsg({ t: 'err', m: authError(err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-panel lg:grid-cols-[1.1fr_1fr]">
      {/* Vitrine */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#eaf3ff] via-[#d9ebff] to-[#9fcbff] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.9),transparent_55%)]" />
        <div className="relative flex h-full flex-col p-12">
          <Reveal>
            <Logo size={44} />
          </Reveal>
          <div className="mt-16 max-w-lg">
            <Reveal i={1}>
              <span className="chip bg-white/80 px-3 py-1.5 text-brand">Agente SCALABLE · uma IA para toda a empresa</span>
              <h1 className="mt-4 text-[44px] font-extrabold leading-[1.05] tracking-tight text-ink">
                Sua empresa no piloto automático.
              </h1>
              <p className="mt-4 text-base text-slate-600">Vendas, marketing, financeiro, atendimento e gestão em uma única conversa — com você aprovando só o que importa.</p>
            </Reveal>
          </div>
          <div className="relative mt-auto h-72">
            <Reveal i={3} className="absolute left-0 top-6 w-64 -rotate-6 rounded-3xl bg-white/90 p-4 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                <BellRing size={15} /> Alerta financeiro
              </div>
              <p className="mt-1.5 text-sm font-semibold">Aluguel vence amanhã</p>
              <p className="text-xs text-muted">R$ 3.500,00 · Agente SCALABLE</p>
            </Reveal>
            <Reveal i={4} className="absolute left-48 top-28 w-72 rotate-2 rounded-3xl bg-brand p-5 text-white shadow-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                <TrendingUp size={15} /> Vendas no mês
              </div>
              <p className="mt-2 text-3xl font-bold">R$ 48.920</p>
              <span className="chip mt-3 bg-white text-brand">↑ 18,4% vs mês passado</span>
            </Reveal>
            <Reveal i={5} className="absolute right-6 top-0 w-60 rotate-6 rounded-3xl bg-white/90 p-4 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                <MessageCircle size={15} /> WhatsApp
              </div>
              <p className="mt-1.5 text-sm font-semibold">12 clientes respondidos</p>
              <p className="text-xs text-muted">2 aguardam sua aprovação</p>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <Reveal className="mb-10 lg:hidden">
            <Logo size={44} />
          </Reveal>
          <Reveal i={1}>
            <h2 className="text-3xl font-bold tracking-tight">{mode === 'login' ? 'Bem-vindo de volta' : mode === 'signup' ? 'Crie sua conta' : 'Recuperar senha'}</h2>
            <p className="mt-2 text-sm text-muted">{mode === 'signup' ? 'Comece a gerir sua empresa com IA em minutos.' : mode === 'login' ? 'Entre para ver como está sua empresa hoje.' : 'Enviaremos um link para o seu e-mail.'}</p>
          </Reveal>
          <Reveal i={2} className="mt-8 space-y-3">
            <input className="input h-12" type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {mode !== 'reset' && (
              <input
                className="input h-12"
                type="password"
                required
                minLength={6}
                placeholder="Senha (mín. 6 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            )}
            {mode === 'signup' && (
              <label className="flex items-start gap-2.5 text-left text-xs text-muted">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#48a8fc]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                <span>
                  Li e aceito os{' '}
                  <Link to="/termos" target="_blank" className="font-semibold text-ink underline underline-offset-2">Termos de Uso</Link> e a{' '}
                  <Link to="/privacidade" target="_blank" className="font-semibold text-ink underline underline-offset-2">Política de Privacidade</Link>.
                </span>
              </label>
            )}
            {msg && <p className={`rounded-2xl px-4 py-3 text-sm ${msg.t === 'err' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.m}</p>}
            <button className="btn-primary h-12 w-full" disabled={busy}>
              {busy && <Spinner />} {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta grátis' : 'Enviar link'}
            </button>
          </Reveal>
          <Reveal i={3} className="mt-6 space-y-2 text-center text-sm text-muted">
            {mode === 'login' ? (
              <>
                <p>
                  Não tem conta?{' '}
                  <button type="button" className="font-bold text-brand" onClick={() => setMode('signup')}>
                    Criar agora
                  </button>
                </p>
                <button type="button" className="text-xs hover:text-ink" onClick={() => setMode('reset')}>
                  Esqueci minha senha
                </button>
              </>
            ) : (
              <button type="button" className="font-bold text-brand" onClick={() => setMode('login')}>
                Já tenho conta
              </button>
            )}
          </Reveal>
          <LegalFooter className="mt-8" />
        </form>
      </div>
    </div>
  )
}

/** Mensagens de erro de login/cadastro em português e com orientação. */
function authError(m: string) {
  const e = m.toLowerCase()
  if (e.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (e.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar. Não achou? Veja a caixa de spam.'
  if (e.includes('already registered') || e.includes('already been registered')) return 'Já existe uma conta com esse e-mail. Faça login ou use "Esqueci minha senha".'
  if (e.includes('not authorized') || e.includes('sending') || e.includes('smtp') || e.includes('email address'))
    return 'Não conseguimos enviar o e-mail agora. O envio de e-mails da Scalable está sendo ativado — tente de novo mais tarde.'
  if (e.includes('rate limit') || e.includes('too many') || e.includes('security purposes')) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
  if (e.includes('password') && (e.includes('at least') || e.includes('should be'))) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (e.includes('valid email') || e.includes('invalid email')) return 'Informe um e-mail válido.'
  return m
}
