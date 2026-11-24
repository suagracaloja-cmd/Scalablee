import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useDiagnostic } from '../context'
import { TEAM_LABEL } from '../engine/content'
import type { Profile, TeamSize } from '../engine/types'
import { DiagError } from '../lib/api'
import { SITE_URL } from '../lib/events'
import { store } from '../lib/storage'
import { useTitle } from '../lib/useTitle'

const TEAMS: TeamSize[] = ['solo', '2-3', '4-7', '8-15', '16+']
const SPECIALTIES = ['Odontologia', 'Fisioterapia', 'Psicologia', 'Nutrição', 'Dermatologia', 'Estética', 'Clínica médica', 'Pediatria', 'Ortopedia', 'Oftalmologia']
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

type Errors = Partial<Record<'name' | 'clinic' | 'team' | 'email' | 'consent', string>>

export default function Identify() {
  useTitle('Identificação')
  const nav = useNavigate()
  const { begin, restart, inProgress, answeredCount } = useDiagnostic()
  const hint = store.profile()
  const [f, setF] = useState({
    name: hint?.name ?? '',
    clinic: hint?.clinic ?? '',
    specialty: hint?.specialty ?? '',
    team: (hint?.team ?? '') as TeamSize | '',
    email: hint?.email ?? '',
  })
  const [consent, setConsent] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)

  // O erro de um campo some assim que a pessoa mexe nele.
  const clear = (k: keyof Errors) => setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value })
    if (k !== 'specialty') clear(k)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next: Errors = {}
    if (!f.name.trim()) next.name = 'Informe o seu nome.'
    if (!f.clinic.trim()) next.clinic = 'Informe o nome da clínica.'
    if (!f.team) next.team = 'Escolha o tamanho aproximado da equipe.'
    if (!EMAIL.test(f.email.trim())) next.email = 'Informe um e-mail válido.'
    if (!consent) next.consent = 'Para gerar o diagnóstico, precisamos da sua concordância.'
    setErrors(next)
    setFail(null)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      if (inProgress) restart() // um novo diagnóstico substitui o que estava em andamento
      const profile: Profile = { name: f.name.trim(), clinic: f.clinic.trim(), specialty: f.specialty.trim(), team: f.team as TeamSize, email: f.email.trim() }
      await begin(profile, marketing)
      nav('/pergunta/1')
    } catch (err) {
      setFail(err instanceof DiagError ? err.message : 'Não foi possível iniciar agora. Tente de novo.')
      setBusy(false)
    }
  }

  return (
    <>
      <header className="rx-wrap rx-top">
        <Link to="/" aria-label="SCALABLE">
          <Logo />
        </Link>
        <Link className="rx-link" to="/">
          Voltar
        </Link>
      </header>

      <main className="rx-wrap rx-ident">
        <div className="rx-ident__copy">
          <p className="rx-eyebrow">Antes de começar</p>
          <h1 className="rx-h2 rx-h2--lg">Conte um pouco sobre a clínica</h1>
          <p className="rx-lede">
            Essas informações ajudam a contextualizar o diagnóstico: o nome da clínica aparece no relatório e o tamanho da equipe muda o jeito como as recomendações são escritas.
          </p>
          <details className="rx-details">
            <summary>Como usamos os seus dados</summary>
            <ul>
              <li>Gerar e guardar o seu diagnóstico e o relatório em PDF.</li>
              <li>Entender, de forma agregada, quais pontos da gestão mais aparecem entre as clínicas.</li>
              <li>Neste navegador, preencher o cadastro caso você decida criar uma conta na SCALABLE.</li>
              <li>Você pode apagar tudo a qualquer momento, na tela do relatório. Não pedimos telefone.</li>
            </ul>
          </details>
          {inProgress && answeredCount > 0 && (
            <p className="rx-note">Atenção: começar um novo diagnóstico substitui o que está em andamento ({answeredCount} de 25 respondidas).</p>
          )}
        </div>

        <form className="rx-form" onSubmit={submit} noValidate>
          <Field id="name" label="Seu nome" error={errors.name}>
            <input id="name" className="rx-input" autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field id="clinic" label="Nome da clínica" error={errors.clinic}>
            <input id="clinic" className="rx-input" autoComplete="organization" value={f.clinic} onChange={set('clinic')} aria-invalid={!!errors.clinic} />
          </Field>
          <Field id="specialty" label="Especialidade ou área de atuação" hint="Opcional">
            <input id="specialty" className="rx-input" list="rx-specialties" value={f.specialty} onChange={set('specialty')} />
            <datalist id="rx-specialties">
              {SPECIALTIES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <fieldset className="rx-field">
            <legend className="rx-field__label">Quantas pessoas trabalham na clínica, contando com você?</legend>
            <div className="rx-seg" role="radiogroup" aria-invalid={!!errors.team}>
              {TEAMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={f.team === t}
                  className={`rx-seg__item ${f.team === t ? 'is-on' : ''}`}
                  onClick={() => {
                    setF({ ...f, team: t })
                    clear('team')
                  }}
                >
                  {TEAM_LABEL[t].replace(' pessoas', '').replace('Só o proprietário', 'Só eu')}
                </button>
              ))}
            </div>
            {errors.team && <p className="rx-error">{errors.team}</p>}
          </fieldset>
          <Field id="email" label="E-mail" error={errors.email}>
            <input id="email" type="email" inputMode="email" className="rx-input" autoComplete="email" value={f.email} onChange={set('email')} aria-invalid={!!errors.email} />
          </Field>

          <div className="rx-checks">
            <label className="rx-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  clear('consent')
                }}
              />
              <span>Concordo que a SCALABLE guarde as informações e as respostas deste diagnóstico para gerar o meu relatório. Posso apagá-las quando quiser.</span>
            </label>
            {errors.consent && <p className="rx-error">{errors.consent}</p>}
            <p className="rx-fine">
              Veja a{' '}
              <a className="rx-link" href={`${SITE_URL}/privacidade`} target="_blank" rel="noopener noreferrer">
                política de privacidade
              </a>
              . Seus dados ficam guardados para gerar o relatório e podem ser apagados por você a qualquer momento.
            </p>
            <label className="rx-check">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>Quero receber conteúdos e novidades da SCALABLE por e-mail. Opcional.</span>
            </label>
          </div>

          {fail && (
            <p className="rx-error rx-error--box" role="alert">
              {fail}
            </p>
          )}
          <button className="rx-btn rx-btn--primary rx-btn--block" disabled={busy}>
            {busy ? 'Iniciando…' : 'Começar as 25 perguntas'}
          </button>
        </form>
      </main>
    </>
  )
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="rx-field">
      <label className="rx-field__label" htmlFor={id}>
        {label} {hint && <span className="rx-field__hint">{hint}</span>}
      </label>
      {children}
      {error && <p className="rx-error">{error}</p>}
    </div>
  )
}
