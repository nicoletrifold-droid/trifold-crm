const APP_SHELL_CACHE = 'trifold-shell-v4'
const STATIC_CACHE = 'trifold-static-v4'
const OFFLINE_PAGE_CLIENTE = '/cliente/offline'
const OFFLINE_PAGE_DASHBOARD = '/dashboard/offline'

const APP_SHELL_URLS = [OFFLINE_PAGE_CLIENTE, OFFLINE_PAGE_DASHBOARD, '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  const keep = [APP_SHELL_CACHE, STATIC_CACHE]
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => clients.claim())
  )
})

const offlineFallback = (page) =>
  caches.match(page).then(
    (r) => r ?? new Response('Offline', { status: 503 })
  )

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and API routes
  if (request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Navigation in /dashboard → network-first, offline fallback
  if (request.mode === 'navigate' && url.pathname.startsWith('/dashboard')) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_PAGE_DASHBOARD).then(
          (r) => r ?? new Response('Offline', { status: 503 })
        )
      )
    )
    return
  }

  // Navigation in /cliente → network-first, offline fallback
  if (request.mode === 'navigate' && url.pathname.startsWith('/cliente')) {
    event.respondWith(
      fetch(request).catch(() => offlineFallback(OFFLINE_PAGE_CLIENTE))
    )
    return
  }

  // Next.js static assets + images → cache-first, background revalidate
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    /\.(png|jpe?g|svg|gif|webp|ico|woff2?)(\?.*)?$/.test(url.pathname)

  if (isStatic) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const networkFetch = fetch(request).then((resp) => {
          if (resp.ok) cache.put(request, resp.clone())
          return resp
        }).catch(() => cached ?? offlineFallback())
        return cached ?? networkFetch
      })
    )
  }
})

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Trifold', {
      body: data.body ?? 'Você tem uma nova atualização.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'trifold',
      renotify: !!data.tag,
      data: { url: data.url ?? '/cliente' },
      actions: Array.isArray(data.actions) ? data.actions : [],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/cliente'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) => c.url.startsWith(self.location.origin + '/cliente'))
        if (existing) return existing.focus().then((c) => c.navigate(target))
        return clients.openWindow(target)
      })
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'trifold-sync') {
    event.waitUntil(Promise.resolve())
  }
})
