import { diagTrack } from './api'
import { store } from './storage'

export type JourneyEvent = 'report_viewed' | 'cta_clicked' | 'pdf_downloaded' | 'retake_started'

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

/** Site da SCALABLE (o produto). O diagnóstico é um site à parte; é para lá que levam "Já tenho conta" e o botão final. */
export const SITE_URL = (import.meta.env.VITE_SCALABLE_URL || 'https://scalablee.vercel.app').replace(/\/$/, '')

/** Cadastro real da plataforma. Não há integração entre os dois sites: o clique é medido, a assinatura não. */
export const SIGNUP_URL = `${SITE_URL}/`
