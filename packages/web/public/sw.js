const OFFLINE_PAGE = '/cliente/offline'
const OFFLINE_CACHE = 'trifold-offline-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_PAGE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  )
})

const offlineFallback = () =>
  caches.match(OFFLINE_PAGE).then(
    (r) => r ?? new Response('Você está offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  )

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' &&
      event.request.url.includes('/cliente')) {
    event.respondWith(
      fetch(event.request).catch(() => offlineFallback())
    )
    return
  }
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request).then((r) => r ?? fetch(event.request)))
  )
})

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Trifold', {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/cliente' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
