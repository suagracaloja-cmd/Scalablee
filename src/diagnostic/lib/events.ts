import { diagTrack } from './api'
import { store } from './storage'

export type JourneyEvent = 'report_viewed' | 'cta_clicked' | 'pdf_downloaded' | 'retake_started' | 'signup_started'

/**
 * Registra um evento da jornada para medir o funil. Só envia quando existe uma sessão de diagnóstico
 * criada com o consentimento do usuário neste navegador; não identifica ninguém além dessa sessão
 * e nunca bloqueia nem quebra a navegação.
 */
export function trackEvent(event: JourneyEvent, placement = ''): void {
  const token = store.token()
  if (!token) return
  diagTrack(token, event, placement).catch(() => {})
}

/** Endereço do cadastro existente da plataforma, com a origem do clique para o funil. */
export const SIGNUP_PATH = '/?cadastro=1&origem=raio-x'
