import type { Answers, DimensionId, Profile } from '../engine/types'

/**
 * Armazenamento local do diagnóstico. Tudo fica neste navegador: o token que identifica a sessão,
 * o rascunho das respostas (para retomar sem rede) e um histórico enxuto para comparar diagnósticos futuros.
 * Todo acesso é protegido: modo privado, dados bloqueados ou cota cheia nunca podem quebrar a jornada.
 */

const KEY = {
  token: 'rx.v1.token',
  draft: 'rx.v1.draft',
  history: 'rx.v1.history',
  profile: 'rx.v1.profile',
  viewed: 'rx.v1.viewed',
} as const

export interface Draft {
  profile: Profile
  answers: Answers
  startedAt: string
}

export interface HistoryItem {
  token: string
  completedAt: string
  clinic: string
  overall100: number | null
  knownPct: number
  dims: Record<DimensionId, number | null>
}

function read<T>(storage: 'local' | 'session', key: string): T | null {
  try {
    const raw = (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

function write(storage: 'local' | 'session', key: string, value: unknown): void {
  try {
    ;(storage === 'local' ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value))
  } catch {
    /* sem armazenamento: a jornada segue em memória */
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignorado */
  }
}

export const store = {
  token: () => read<string>('local', KEY.token),
  setToken: (t: string) => write('local', KEY.token, t),
  clearToken: () => remove(KEY.token),

  draft: () => read<Draft>('local', KEY.draft),
  setDraft: (d: Draft) => write('local', KEY.draft, d),
  clearDraft: () => remove(KEY.draft),

  /** Último perfil informado: preenche o formulário de um novo diagnóstico e o cadastro na plataforma. */
  profile: () => read<Profile>('local', KEY.profile),
  setProfile: (p: Profile) => write('local', KEY.profile, p),
  clearProfile: () => remove(KEY.profile),

  history: () => read<HistoryItem[]>('local', KEY.history) ?? [],
  addHistory: (item: HistoryItem) => {
    const list = (read<HistoryItem[]>('local', KEY.history) ?? []).filter((h) => h.token !== item.token)
    write('local', KEY.history, [...list, item].slice(-10))
  },
  removeHistory: (token: string) => {
    const rest = (read<HistoryItem[]>('local', KEY.history) ?? []).filter((h) => h.token !== token)
    if (rest.length) write('local', KEY.history, rest)
    else remove(KEY.history)
  },

  /** Marca, por aba, que a visualização do relatório já foi registrada. */
  viewed: (token: string) => read<string[]>('session', KEY.viewed)?.includes(token) ?? false,
  setViewed: (token: string) => write('session', KEY.viewed, [...(read<string[]>('session', KEY.viewed) ?? []), token]),
}
