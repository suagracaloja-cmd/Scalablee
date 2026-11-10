import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Logo, Reveal, Spinner } from '../components/ui'
import { SENHA_MIN, senhaFraca } from '../lib/senha'

/** Tela aberta pelo link de "Esqueci minha senha": define a nova senha da conta. */
export default function ResetPassword() {
  const { endRecovery, toast } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    const fraca = senhaFraca(password)
    if (fraca) return setErr(fraca)
    if (password !== confirm) return setErr('As duas senhas não são iguais.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErr(error.message)
    toast('Senha alterada com sucesso')
    endRecovery()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <Reveal className="mb-10">
          <Logo size={44} />
        </Reveal>
        <Reveal i={1}>
          <h2 className="text-3xl font-bold tracking-tight">Defina sua nova senha</h2>
          <p className="mt-2 text-sm text-muted">Escolha uma senha nova para entrar na Coraline AI.</p>
        </Reveal>
        <Reveal i={2} className="mt-8 space-y-3">
          <input className="input h-12" type="password" required minLength={SENHA_MIN} maxLength={72} placeholder={`Nova senha (mín. ${SENHA_MIN} caracteres, letras e números)`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <input className="input h-12" type="password" required minLength={SENHA_MIN} maxLength={72} placeholder="Repita a nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          {err && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>}
          <button className="btn-primary h-12 w-full" disabled={busy}>
            {busy && <Spinner />} Salvar nova senha
          </button>
        </Reveal>
      </form>
    </div>
  )
}
