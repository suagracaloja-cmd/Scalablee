import { createContext, useContext } from 'react'
import type { Answer, Answers, Profile, QuestionId, Report } from './engine/types'

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline'

export interface DiagnosticState {
  profile: Profile | null
  answers: Answers
  token: string | null
  report: Report | null
  sync: SyncState
  answeredCount: number
  /** Número (1 a 25) da primeira pergunta sem resposta; 26 quando todas foram respondidas. */
  firstUnanswered: number
  /** Há um diagnóstico em andamento (sessão criada, ainda não concluído). */
  inProgress: boolean
  /** Cria a sessão no servidor, com o consentimento do usuário. */
  begin: (profile: Profile, marketing: boolean) => Promise<void>
  setAnswer: (id: QuestionId, value: Answer) => void
  /** Gera o relatório, grava no servidor e devolve o relatório. */
  complete: () => Promise<Report>
  /** Recupera o relatório de uma sessão já concluída (recarregar a página, voltar depois). */
  hydrate: () => Promise<'ok' | 'none' | 'in_progress'>
  /** Passa a trabalhar com um diagnóstico já concluído deste navegador (o relatório é recuperado do servidor). */
  open: (token: string) => void
  /** Descarta a sessão atual para começar outra. O histórico local é mantido. */
  restart: () => void
  /** Direito de exclusão: apaga no servidor todos os diagnósticos deste navegador e limpa o armazenamento local. */
  erase: () => Promise<void>
}

export const DiagnosticContext = createContext<DiagnosticState | null>(null)

export function useDiagnostic(): DiagnosticState {
  const ctx = useContext(DiagnosticContext)
  if (!ctx) throw new Error('useDiagnostic fora do DiagnosticProvider')
  return ctx
}
