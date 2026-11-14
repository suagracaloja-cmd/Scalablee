import { useState, type FormEvent } from 'react'
import { BellRing, CalendarDays, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { avisoConfirmacao, supabase } from '../lib/supabase'
import { LEGAL_VERSION } from '../lib/legal-dados'
import { Logo, Reveal, Spinner } from '../components/ui'
import { LegalFooter } from '../components/LegalFooter'
import { Captcha, CAPTCHA_ATIVO } from '../components/Captcha'
import { SENHA_MIN, senhaFraca } from '../lib/senha'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(
    avisoConfirmacao.pendente
      ? { t: 'ok', m: 'E-mail confirmado! Agora é só entrar com o seu e-mail e a sua senha.' }
      : avisoConfirmacao.erro
        ? { t: 'err', m: 'Esse link expirou ou já foi usado. Se você já confirmou o e-mail, é só entrar com o e-mail e a senha.' }
        : null,
  )
  const [accepted, setAccepted] = useState(false)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [rodada, setRodada] = useState(0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    avisoConfirmacao.pendente = false
    avisoConfirmacao.erro = false
    setMsg(null)
    if (CAPTCHA_ATIVO && !captcha) return setMsg({ t: 'err', m: 'Confirme que você não é um robô.' })
    const captchaToken = captcha ?? undefined
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        if (error) throw error
      } else if (mode === 'signup') {
        if (!accepted) throw new Error('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.')
        const fraca = senhaFraca(password)
        if (fraca) throw new Error(fraca)
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { captchaToken, emailRedirectTo: `${window.location.origin}/?email=confirmado`, data: { terms_accepted_at: new Date().toISOString(), terms_version: LEGAL_VERSION } },
        })
        if (error) throw error
        if (!data.session) setMsg({ t: 'ok', m: 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois faça login.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin, captchaToken })
        if (error) throw error
        setMsg({ t: 'ok', m: 'Enviamos um link de redefinição para o seu e-mail.' })
      }
    } catch (err) {
      setMsg({ t: 'err', m: authError(err instanceof Error ? err.message : String(err)) })
    } finally {
      setBusy(false)
      if (CAPTCHA_ATIVO) setRodada((r) => r + 1) // cada verificação vale para um envio
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
              <span className="chip bg-white/80 px-3 py-1.5 text-brand-dark">Coraline AI · assistente de IA para clínicas</span>
              <h1 className="mt-4 text-[44px] font-extrabold leading-[1.05] tracking-tight text-ink">
                Sua clínica organizada, do WhatsApp à agenda.
              </h1>
              <p className="mt-4 text-base text-slate-600">Atendimento, agenda, pacientes, marketing e financeiro em um só lugar — com a Coraline AI preparando o trabalho e você aprovando o que importa.</p>
            </Reveal>
          </div>
          {/* Ilustração da interface (exemplos, não são dados reais) */}
          <div className="relative mt-auto h-72" aria-hidden="true">
            <Reveal i={3} className="absolute left-0 top-6 w-64 -rotate-6 rounded-3xl bg-white/90 p-4 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                <BellRing size={15} /> Lembrete
              </div>
              <p className="mt-1.5 text-sm font-semibold">Consulta amanhã às 9h</p>
              <p className="text-xs text-muted">Confirmação pelo WhatsApp</p>
            </Reveal>
            <Reveal i={4} className="absolute left-48 top-28 w-72 rotate-2 rounded-3xl bg-brand p-5 text-white shadow-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                <CalendarDays size={15} /> Agenda de hoje
              </div>
              <ul className="mt-2 space-y-1.5 text-sm font-semibold">
                <li>09:00 · Avaliação</li>
                <li>10:30 · Limpeza</li>
                <li>14:00 · Retorno</li>
              </ul>
            </Reveal>
            <Reveal i={5} className="absolute right-6 top-0 w-60 rotate-6 rounded-3xl bg-white/90 p-4 shadow-xl backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                <MessageCircle size={15} /> WhatsApp
              </div>
              <p className="mt-1.5 text-sm font-semibold">Paciente pediu para remarcar</p>
              <p className="text-xs text-muted">A Coraline AI preparou · aguarda aprovação</p>
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
            <p className="mt-2 text-sm text-muted">{mode === 'signup' ? 'Comece a organizar sua clínica com IA em minutos.' : mode === 'login' ? 'Entre para ver como está sua clínica hoje.' : 'Enviaremos um link para o seu e-mail.'}</p>
          </Reveal>
          <Reveal i={2} className="mt-8 space-y-3">
            <input maxLength={254} className="input h-12" type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {mode !== 'reset' && (
              <input
                className="input h-12"
                type="password"
                required
                maxLength={72}
                minLength={mode === 'signup' ? SENHA_MIN : undefined}
                placeholder={mode === 'signup' ? `Senha (mín. ${SENHA_MIN} caracteres, letras e números)` : 'Senha'}
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
            <Captcha onToken={setCaptcha} rodada={rodada} />
            {msg && <p role={msg.t === 'err' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-sm ${msg.t === 'err' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.m}</p>}
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
  if (e.includes('captcha')) return 'A verificação anti-robô falhou ou expirou. Confirme de novo e tente outra vez.'
  if (e.includes('password') && (e.includes('at least') || e.includes('should') || e.includes('weak'))) return `Senha fraca: use pelo menos ${SENHA_MIN} caracteres, com letras e números.`
  if (e.includes('valid email') || e.includes('invalid email')) return 'Informe um e-mail válido.'
  return m
}
