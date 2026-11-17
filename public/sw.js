// Service worker da Scalable (app instalado no celular ou no computador).
//  * Recebe as notificações (mensagem nova no WhatsApp, aprovação pendente), mesmo com o app fechado.
//  * Guarda só a página base do app, para ele abrir sem internet. Dados de pacientes, agenda e
//    financeiro NUNCA passam por este cache: vêm sempre direto do servidor.
const CACHE = 'scalable-app-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

const LIMITE_ARQUIVOS = 150

// Arquivos do app (/assets/*): o nome muda a cada versão, então o guardado nunca fica velho.
// Só guarda JavaScript, CSS, fontes e imagens (nunca uma página no lugar de um arquivo).
async function arquivoDoApp(req) {
  const cache = await caches.open(CACHE)
  const guardado = await cache.match(req)
  if (guardado) return guardado
  const r = await fetch(req)
  const tipo = r.headers.get('content-type') || ''
  if (r.ok && !tipo.includes('text/html') && /javascript|css|font|image/.test(tipo)) {
    await cache.put(req, r.clone())
    const chaves = await cache.keys()
    for (const k of chaves.slice(0, Math.max(0, chaves.length - LIMITE_ARQUIVOS))) if (new URL(k.url).pathname !== '/') await cache.delete(k)
  }
  return r
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // dados (Supabase) nunca passam por aqui
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(arquivoDoApp(req))
    return
  }
  if (req.mode !== 'navigate') return
  // Navegação: tenta a internet primeiro; sem conexão, abre a página base guardada.
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && (r.headers.get('content-type') || '').includes('text/html')) {
          const copia = r.clone()
          caches.open(CACHE).then((c) => c.put('/', copia)).catch(() => {})
        }
        return r
      })
      .catch(async () => (await caches.match('/')) || new Response('Sem conexão com a internet.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })),
  )
})

self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { texto: e.data ? e.data.text() : '' }
  }
  const titulo = d.titulo || 'Scalable'
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.texto || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      lang: 'pt-BR',
      data: { url: d.url || '/' },
    }),
  )
})

// Tocar na notificação abre o app na tela certa (Aprovações, WhatsApp…)
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const destino = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin)
  if (destino.origin !== self.location.origin) return
  e.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const j of janelas) {
        if (new URL(j.url).origin !== self.location.origin) continue
        await j.focus()
        j.postMessage({ tipo: 'abrir', url: destino.pathname + destino.search })
        return
      }
      await self.clients.openWindow(destino.href)
    })(),
  )
})
