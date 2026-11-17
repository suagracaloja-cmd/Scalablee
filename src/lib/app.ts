// App instalado no celular (PWA) e notificações (Web Push, gratuito).
import { api, supabase } from './supabase'

// ---------- instalação ----------
type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let pedido: PedidoInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

/** Chamado uma vez ao abrir o site: registra o service worker e guarda o convite de instalação do navegador. */
export function iniciarApp() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    pedido = e as PedidoInstalacao
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    pedido = null
    avisar()
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
}
export const ouvirApp = (f: () => void) => {
  ouvintes.add(f)
  return () => {
    ouvintes.delete(f)
  }
}

export const instalado = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const ehAndroid = () => /android/i.test(navigator.userAgent)
export const podeInstalar = () => !!pedido

/** Abre a janela de instalação do navegador (Android/Chrome/Edge). */
export async function instalar() {
  if (!pedido) return false
  await pedido.prompt()
  const r = await pedido.userChoice
  pedido = null
  avisar()
  return r.outcome === 'accepted'
}

// ---------- notificações ----------
export type EstadoNotif = 'sem-suporte' | 'precisa-instalar' | 'bloqueadas' | 'desligadas' | 'ligadas'
export type Preferencias = { whatsapp: boolean; aprovacoes: boolean }

export const suportaPush = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function inscricaoLocal() {
  if (!suportaPush()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Preferências deste aparelho para quem está logado (null = notificações desligadas aqui). */
export async function preferenciasDesteAparelho(): Promise<Preferencias | null> {
  const s = await inscricaoLocal()
  if (!s) return null
  const { data } = await supabase.from('push_inscricoes').select('whatsapp, aprovacoes').eq('endpoint', s.endpoint).maybeSingle()
  return (data as Preferencias | null) ?? null
}

export async function estadoNotificacoes(): Promise<{ estado: EstadoNotif; pref: Preferencias | null }> {
  // iPhone/iPad: o Safari só entrega notificações para o app instalado na Tela de Início (iOS 16.4 ou mais novo)
  if (ehIOS() && !instalado()) return { estado: 'precisa-instalar', pref: null }
  if (!suportaPush()) return { estado: 'sem-suporte', pref: null }
  if (Notification.permission === 'denied') return { estado: 'bloqueadas', pref: null }
  const pref = Notification.permission === 'granted' ? await preferenciasDesteAparelho() : null
  return { estado: pref ? 'ligadas' : 'desligadas', pref }
}

const chaveParaBytes = (b: string) => {
  const t = b.replace(/-/g, '+').replace(/_/g, '/')
  const s = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
const nomeDoAparelho = () => {
  const ua = navigator.userAgent
  const so = ehAndroid() ? 'Android' : ehIOS() ? 'iPhone/iPad' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'Computador'
  const nav = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Navegador'
  return `${so} · ${nav}`
}

/** Pede permissão, inscreve este aparelho e guarda no nome de quem está logado. */
export async function ativarNotificacoes(pref: Preferencias = { whatsapp: true, aprovacoes: true }) {
  if (!suportaPush()) throw new Error('Este navegador não recebe notificações.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted')
    throw new Error(perm === 'denied' ? 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador e tente de novo.' : 'Permissão não concedida.')
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  let s = await reg.pushManager.getSubscription()
  if (!s) {
    const { publicKey } = await api<{ publicKey: string }>('push', { action: 'chave' })
    s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(publicKey) })
  }
  const j = s.toJSON()
  const { error } = await supabase.rpc('push_inscrever', {
    p_endpoint: s.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_whatsapp: pref.whatsapp,
    p_aprovacoes: pref.aprovacoes,
    p_aparelho: nomeDoAparelho(),
  })
  if (error) throw new Error(error.message)
}

export async function mudarPreferencia(campo: keyof Preferencias, valor: boolean) {
  const s = await inscricaoLocal()
  if (!s) return
  const { error } = await supabase.from('push_inscricoes').update({ [campo]: valor }).eq('endpoint', s.endpoint)
  if (error) throw new Error(error.message)
}

export async function desativarNotificacoes() {
  const s = await inscricaoLocal()
  if (!s) return
  await supabase.from('push_inscricoes').delete().eq('endpoint', s.endpoint)
  await s.unsubscribe().catch(() => {})
}

export const testarNotificacao = () => api<{ aparelhos: number; enviados: number; falhas: number }>('push', { action: 'testar' })

/** Sair da conta: este aparelho para de receber os avisos de quem saiu. */
export async function sair() {
  try {
    await desativarNotificacoes()
  } catch {
    /* sem conexão: a inscrição é apagada quando o serviço de push recusar */
  }
  await supabase.auth.signOut()
}
