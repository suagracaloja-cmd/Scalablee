import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
