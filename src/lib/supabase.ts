import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** Chegou pelo link de "Esqueci minha senha"? (lido antes de o cliente do Supabase limpar o endereço) */
export const OPENED_FROM_RECOVERY_LINK = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search)

/**
 * Voltou do link de confirmação do cadastro? O e-mail leva a /?email=confirmado.
 * Em caso de sucesso o Supabase já cria a sessão; aqui a pessoa é encaminhada à tela de login (com um aviso).
 * Se o link expirou ou já foi usado, o endereço traz um erro e mostramos outro aviso.
 * (lido antes de o cliente do Supabase limpar o endereço)
 */
const veioDoEmail = typeof window !== 'undefined' && /[?&]email=confirmado\b/.test(window.location.search)
const veioComErro = veioDoEmail && /error/.test(window.location.hash + window.location.search)
export const avisoConfirmacao = { pendente: veioDoEmail && !veioComErro, erro: veioComErro }

export const supabase = createClient(url, key)

/** Chama uma rota da Edge Function `api` com a sessão do usuário. */
export async function api<T = unknown>(route: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${url}/functions/v1/api/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)
  return json as T
}

/** Chama outra Edge Function (ex.: chat). */
export async function callFn<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)
  return json as T
}

export const WEBHOOK_URL = `${url}/functions/v1/api/wa-webhook`
