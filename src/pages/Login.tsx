import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { avisoConfirmacao, supabase } from '../lib/supabase'
import { LEGAL_VERSION } from '../lib/legal-dados'
import { Logo, Orb, Reveal, Spinner } from '../components/ui'
import { LegalFooter } from '../components/LegalFooter'
import { Captcha, CAPTCHA_ATIVO } from '../components/Captcha'
import { SENHA_MIN, senhaFraca } from '../lib/senha'
import { jaEntrouAntes, marcarQueEntrou } from '../lib/visitante'

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
        marcarQueEntrou() // a pessoa agora tem conta: na próxima vez, "Bem-vindo de volta"
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
      <div className="relative hidden overflow-hidden border-r border-line bg-bg lg:block">
        <div className="flex h-full flex-col p-12 xl:p-16">
          <Reveal>
            <Logo size={36} />
          </Reveal>
          <Reveal i={1} className="mt-16 max-w-xl">
            <h1 className="text-[44px] font-medium leading-[1.08] tracking-[-0.02em] text-ink xl:text-[52px]">
              Sua clínica organizada, do WhatsApp à agenda
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-[1.6] text-secondary">
              Atendimento, agenda, pacientes, marketing e financeiro em um só lugar — com a Coraline AI preparando o trabalho e você aprovando o que importa.
            </p>
          </Reveal>
          {/* Prévia da interface (exemplo ilustrativo, não são dados reais) */}
          <Reveal i={2} className="mt-auto max-w-md pt-12" aria-hidden="true">
            <div className="rounded-panel border border-line bg-panel p-5 shadow-[0_8px_24px_rgba(16,24,40,0.06)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Agenda de hoje</span>
                <span className="text-xs text-muted">3 consultas · 2 confirmadas</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {[
                  { h: '09:00', p: 'Avaliação', d: 'Dra. Paula Lima', c: '#48a8fc', ok: 'Confirmada', passou: true },
                  { h: '10:30', p: 'Limpeza', d: 'Dr. Renato Alves', c: '#8b95a7', ok: 'Confirmada', passou: true },
                ].map((x) => (
                  <li key={x.h} className="flex items-center gap-3 py-1.5 opacity-60">
                    <span className="w-11 font-medium tabular-nums">{x.h}</span>
                    <span className="h-7 w-0.5 rounded-full" style={{ background: x.c }} />
                    <span className="flex-1">{x.p} <span className="text-muted">· {x.d}</span></span>
                    <span className="text-xs text-muted">{x.ok}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 py-0.5 text-xs font-medium tabular-nums text-brand-ink">
                  <span>11:42</span>
                  <span className="h-px flex-1 bg-brand" />
                </li>
                <li className="flex items-center gap-3 py-1.5">
                  <span className="w-11 font-medium tabular-nums">14:00</span>
                  <span className="h-7 w-0.5 rounded-full bg-[#48a8fc]" />
                  <span className="flex-1">Retorno <span className="text-muted">· Dra. Paula Lima</span></span>
                  <span className="text-xs text-amber-700">A confirmar</span>
                </li>
              </ul>
              <div className="mt-4 flex items-start gap-3 rounded-ctl border border-line bg-panel-2 p-3">
                <Orb size={24} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">Paciente das 14:00 pediu para remarcar</p>
                  <p className="text-xs text-muted">A Coraline AI preparou a resposta pelo WhatsApp</p>
                </div>
                <span className="shrink-0 rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white">Aprovar</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <Reveal className="mb-10 lg:hidden">
            <Logo size={36} />
          </Reveal>
          <Reveal i={1}>
            <h2 className="text-[28px] font-semibold leading-tight">{mode === 'login' ? (jaEntrouAntes() ? 'Bem-vindo de volta' : 'Bem-vindo') : mode === 'signup' ? 'Crie sua conta' : 'Recuperar senha'}</h2>
            <p className="mt-2 text-sm text-secondary">{mode === 'signup' ? 'Comece com o teste grátis, sem cadastrar cartão' : mode === 'login' ? 'Entre para ver como está sua clínica hoje' : 'Enviaremos um link para o seu e-mail'}</p>
          </Reveal>
          <Reveal i={2} className="mt-8 space-y-3">
            <input maxLength={254} className="input h-11" type="email" required placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {mode !== 'reset' && (
              <input
                className="input h-11"
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
                  <Link to="/termos" target="_blank" className="font-medium text-ink underline underline-offset-2">Termos de Uso</Link> e a{' '}
                  <Link to="/privacidade" target="_blank" className="font-medium text-ink underline underline-offset-2">Política de Privacidade</Link>.
                </span>
              </label>
            )}
            <Captcha onToken={setCaptcha} rodada={rodada} />
            {msg && <p role={msg.t === 'err' ? 'alert' : 'status'} className={`rounded-ctl px-4 py-3 text-sm ${msg.t === 'err' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.m}</p>}
            <button className="btn-primary h-11 w-full" disabled={busy}>
              {busy && <Spinner />} {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta grátis' : 'Enviar link'}
            </button>
          </Reveal>
          <Reveal i={3} className="mt-6 space-y-2 text-center text-sm text-secondary">
            {mode === 'login' ? (
              <>
                <p>
                  Não tem conta?{' '}
                  <button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => setMode('signup')}>
                    Criar agora
                  </button>
                </p>
                <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setMode('reset')}>
                  Esqueci minha senha
                </button>
              </>
            ) : (
              <button type="button" className="font-medium text-brand-ink hover:underline" onClick={() => setMode('login')}>
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
