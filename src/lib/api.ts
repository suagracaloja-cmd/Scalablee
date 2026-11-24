import type { Answers, Profile, QuestionId, Report } from '../engine/types'

/** Versão do aviso de consentimento mostrado ao usuário. Mude quando o texto mudar. */
export const CONSENT_VERSION = 'v1'

/** Mensagens estáveis devolvidas pelas funções do banco. */
const FRIENDLY: Record<string, string> = {
  consent_required: 'Para continuar, é preciso concordar com o uso dos dados para gerar o diagnóstico.',
  invalid_profile: 'Confira os dados informados: algum campo está vazio ou inválido.',
  rate_limited: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
  invalid_session: 'Não encontramos este diagnóstico neste navegador. Você pode começar um novo.',
  already_completed: 'Este diagnóstico já foi concluído.',
  incomplete_answers: 'Ainda há perguntas sem resposta.',
}

export class DiagError extends Error {
  code: string
  constructor(code: string) {
    super(FRIENDLY[code] ?? 'Não foi possível falar com o servidor agora. Verifique sua conexão e tente de novo.')
    this.code = code
  }
  /** Falha de rede ou servidor (e não uma recusa de regra de negócio): vale tentar de novo. */
  get transient() {
    return !(this.code in FRIENDLY)
  }
}

const BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** Chama uma função do banco pela API REST do Supabase, sem sessão de usuário (a chave é pública e o RLS protege os dados). */
async function call<T>(fn: string, args: Record<string, unknown>, keepalive = false): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: KEY,
        // Chaves antigas (JWT) também vão como Bearer; as novas (sb_publishable_…) só no apikey.
        ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify(args),
      // Eventos disparados por um clique que sai do site (o botão final) precisam sobreviver à navegação.
      keepalive,
    })
  } catch {
    throw new DiagError('network')
  }
  if (!res.ok) {
    let message = 'network'
    try {
      const body = (await res.json()) as { message?: unknown }
      if (typeof body.message === 'string') message = body.message
    } catch {
      /* corpo que não é JSON: falha de servidor ou de rede */
    }
    throw new DiagError(message)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export interface ServerSession {
  status: 'in_progress' | 'completed'
  profile: Profile
  answers: Answers
  last_question: number
  created_at: string
  completed_at: string | null
  report: Report | null
}

export const diagStart = (profile: Profile, marketing: boolean) =>
  call<{ token: string }>('diag_start', { p_profile: profile, p_consent: true, p_marketing: marketing, p_consent_version: CONSENT_VERSION })

export const diagSaveAnswer = (token: string, question: QuestionId, value: number | null) =>
  call<boolean>('diag_save_answer', { p_token: token, p_question: question, p_value: value })

export const diagGet = (token: string) => call<ServerSession | null>('diag_get', { p_token: token })

export const diagComplete = (token: string, answers: Answers, report: Report) =>
  call<{ overall100: number | null; band: string | null }>('diag_complete', {
    p_token: token,
    p_answers: answers,
    p_report: report,
    p_engine_version: report.engineVersion,
  })

export const diagTrack = (token: string, event: string, placement = '') =>
  call<boolean>('diag_track', { p_token: token, p_event: event, p_props: { placement } }, true)

export const diagDelete = (token: string) => call<boolean>('diag_delete', { p_token: token })
