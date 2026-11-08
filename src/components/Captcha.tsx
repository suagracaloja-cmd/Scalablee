import { useEffect, useRef } from 'react'

/**
 * Verificação anti-robô (Cloudflare Turnstile, gratuita) para entrar, criar conta e recuperar senha.
 * Fica DESLIGADA até existir VITE_TURNSTILE_SITE_KEY; o Supabase confere o token quando a proteção
 * por CAPTCHA estiver ligada em Authentication → Attack Protection (ver LANCAMENTO.md).
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
export const CAPTCHA_ATIVO = !!SITE_KEY

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let carregando: Promise<void> | null = null
function carregar() {
  if (window.turnstile) return Promise.resolve()
  carregando ??= new Promise<void>((ok, erro) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => erro(new Error('Não foi possível carregar a verificação anti-robô.'))
    document.head.appendChild(s)
  })
  return carregando
}

/** Mostra a verificação e entrega o token (cada token vale para um envio; mude `rodada` para gerar outro). */
export function Captcha({ onToken, rodada }: { onToken: (token: string | null) => void; rodada: number }) {
  const box = useRef<HTMLDivElement>(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    if (!SITE_KEY || !box.current) return
    let id: string | undefined
    let vivo = true
    cb.current(null)
    carregar()
      .then(() => {
        if (!vivo || !box.current || !window.turnstile) return
        id = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          language: 'pt-br',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        })
      })
      .catch(() => cb.current(null))
    return () => {
      vivo = false
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [rodada])

  if (!SITE_KEY) return null
  return <div ref={box} className="flex min-h-[65px] justify-center" aria-label="Verificação anti-robô" />
}
